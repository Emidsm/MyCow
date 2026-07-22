import { ENTITIES } from './db.js';
import { syncConfig, EPOCH_ISO } from './config.js';

/**
 * MOTOR DE SYNC (headless, sin React).
 *
 * Ciclo: sync() = push() → pull(), SIEMPRE secuencial, nunca en paralelo.
 *
 * ¿Por qué push ANTES que pull?
 *   Si hiciéramos pull primero, podríamos traer del server una versión de un
 *   registro que acabamos de editar localmente pero que aún no hemos empujado
 *   (sigue en el outbox). El LWW podría entonces "ganar" con la copia remota
 *   vieja o generar trabajo redundante. Drenando el outbox primero, el server
 *   ya tiene nuestros cambios y el pull sólo trae novedades reales de otros.
 *
 * Se construye por factory con inyección de dependencias (db, supabase,
 * config) para poder testear en aislamiento con fake-indexeddb + un mock de
 * Supabase, sin tocar red real.
 */

// ─────────────────────────────────────────────────────────────────────────
// PUNTO DE EXTENSIÓN #1 — resolveConflict()
// Regla de conciliación LAST-WRITE-WINS centralizada. Es lo que más se va a
// tocar después: cámbiala AQUÍ y sólo aquí.
//
// Devuelve 'remote' | 'local' indicando qué versión debe prevalecer.
//   - Sin copia local  → gana remoto (registro nuevo que baja del server).
//   - Sin copia remota → gana local.
//   - updated_at más reciente gana (se compara por epoch-ms, NO lexicográfico:
//     el server puede devolver '+00:00' y el cliente 'Z', y la comparación de
//     strings entre ambos formatos sería incorrecta).
//   - EMPATE (mismo updated_at, distinto contenido): gana REMOTO, por ser la
//     fuente convergente compartida por todos los dispositivos. Cambiar esta
//     política (p.ej. a un merge campo-a-campo) se hace SÓLO en este bloque.
// ─────────────────────────────────────────────────────────────────────────
export function resolveConflict(local, remote) {
  if (!local) return 'remote';
  if (!remote) return 'local';

  const localMs = local.updated_at ? new Date(local.updated_at).getTime() : -Infinity;
  const remoteMs = remote.updated_at ? new Date(remote.updated_at).getTime() : -Infinity;

  if (remoteMs > localMs) return 'remote';
  if (localMs > remoteMs) return 'local';

  // <<< EMPATE: política por defecto = gana remoto. Extiende aquí. >>>
  return 'remote';
}

// ─────────────────────────────────────────────────────────────────────────
// TRADUCCIÓN DE FKs client_id → id (PUNTO DE EXTENSIÓN #4)
//
// Localmente TODO se referencia por client_id (identidad estable desde el
// instante de creación offline; ver nota de PK en db.js). Pero el server
// define las FKs reales contra <entidad>.id (gen_random_uuid, ver
// 0002_tables.sql: madre_id/padre_id/potrero_actual_id/animal_id/...
// REFERENCES <tabla>(id)). Antes de empujar, pushOne traduce cada campo FK
// del payload de su client_id local al id real del registro referenciado.
//
// Si el referenciado no existe localmente, o existe pero AÚN no tiene `id`
// (no completó su propio ciclo push+pull todavía — típico offline: la cría
// se crea y se sincroniza antes de que el pull traiga de vuelta el id real
// de la madre), la traducción falla. Se trata como cualquier error de
// upsert: la op queda 'failed' con backoff y se reintenta en el próximo
// ciclo — NUNCA fatal, nunca bloquea el drenado del resto de la cola. Una
// vez el referenciado sincroniza, el reintento resuelve solo.
const FK_FIELDS = {
  animales: { madre_id: 'animales', padre_id: 'animales', potrero_actual_id: 'potreros' },
  historial_categoria: { animal_id: 'animales' },
  movimientos: { animal_id: 'animales', potrero_origen_id: 'potreros', potrero_destino_id: 'potreros' },
  eventos_reproductivos: { madre_id: 'animales', padre_id: 'animales', cria_id: 'animales' },
  defunciones: { animal_id: 'animales' },
  ventas: { animal_id: 'animales' },
  fotos: { animal_id: 'animales' },
};

// FKs opcionales: si el referenciado no existe localmente, se ponen a null
// en vez de atascar la op en waiting_ref. Solo aplica a FKs de campos
// cacheados/derivados (potrero_actual_id), no a FKs de negocio (madre_id).
const OPTIONAL_FKS = new Set([
  'animales.potrero_actual_id',
  'movimientos.potrero_origen_id',
]);

// Una referencia que todavía no sincronizó NO es un fallo: es un estado de
// ESPERA legítimo del offline-first (la cría puede crearse muchos ciclos
// antes que su madre). Se distingue con esta clase de error para que push()
// la trate distinto de un fallo real (red, rechazo del server por otra
// causa): sin attempts++, sin backoff, sin tope de reintentos — espera
// indefinidamente hasta que el referenciado sincronice.
export class UnresolvedReferenceError extends Error {}

async function resolveForeignKeys(db, entity, payload) {
  const fkMap = FK_FIELDS[entity];
  if (!fkMap) return { ...payload }; // sin FKs que traducir; copia igual (pushOne muta deleted_at).

  const resolved = { ...payload };
  for (const [field, targetEntity] of Object.entries(fkMap)) {
    const localId = resolved[field];
    if (localId == null) continue; // FK opcional sin valor: nada que traducir.

    const target = await db[targetEntity].get(localId);
    if (!target) {
      // Si la FK es opcional y el referenciado no existe, limpiamos el
      // campo en lugar de atascar la operación esperando para siempre.
      if (OPTIONAL_FKS.has(`${entity}.${field}`)) {
        resolved[field] = null;
        continue;
      }
      throw new UnresolvedReferenceError(
        `FK ${entity}.${field}: ${targetEntity}/${localId} no existe localmente (aún no sincronizado)`
      );
    }
    if (!target.id) {
      throw new UnresolvedReferenceError(
        `FK ${entity}.${field}: ${targetEntity}/${localId} existe local pero aún no tiene id real (pendiente de su propio pull)`
      );
    }
    resolved[field] = target.id;
  }
  return resolved;
}

export function createEngine({ db, supabase, config = syncConfig } = {}) {
  if (!db) throw new Error('createEngine: falta `db`');
  if (!supabase) throw new Error('createEngine: falta `supabase`');

  const { maxRetries, backoffBaseMs } = config;

  // ── Lock de reentrada ────────────────────────────────────────────────
  // Un flag simple basta porque JS es monohilo: se setea SÍNCRONAMENTE antes
  // del primer await, así que una segunda llamada a sync() concurrente lo ve
  // en true y sale sin arrancar otro ciclo (no encolamos: el próximo tick del
  // scheduler o del usuario reintentará).
  let running = false;

  // ── Metadatos (watermarks) ───────────────────────────────────────────
  async function getMeta(key) {
    const row = await db.sync_meta.get(key);
    return row?.value;
  }
  async function setMeta(key, value) {
    await db.sync_meta.put({ key, value });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUSH — drena el outbox hacia Supabase
  // ═══════════════════════════════════════════════════════════════════
  //
  // - Orden de drenado: por `id` autoincrement, que == orden causal de
  //   encolado (más fiable que created_at, que puede empatar al ms).
  //   → PUNTO DE EXTENSIÓN #2: el orden causal del outbox vive aquí.
  // - Idempotencia: upsert onConflict:'client_id'. Reintentar una op ya
  //   aplicada es un no-op seguro (esto hace robusto el sync ante cortes de
  //   red a media transacción).
  // - Aislamiento de fallos: una op que falla NO detiene el drenado del resto.
  //   Se marca 'failed', attempts++, se guarda last_error y se programa el
  //   backoff (next_retry_at). Al superar maxRetries queda como dead-letter.
  // - EXCEPCIÓN: una op bloqueada sólo porque su referencia (madre_id, etc.)
  //   aún no sincronizó NO es un fallo — status 'waiting_ref', SIN attempts++,
  //   SIN backoff, SIN dead-letter. Se reintenta en cada ciclo indefinidamente
  //   hasta que el referenciado sincronice (ver UnresolvedReferenceError
  //   arriba). attempts/backoff quedan reservados para fallos reales.
  async function push() {
    const ops = await db.outbox.orderBy('id').toArray();
    const now = Date.now();
    const result = { pushed: 0, failed: 0, waitingRef: 0, skipped: 0 };

    for (const op of ops) {
      // Ops en pleno vuelo de otra ejecución: no las tocamos.
      if (op.status === 'syncing') { result.skipped++; continue; }

      // Backoff / dead-letter para ops con fallo REAL. 'waiting_ref' no pasa
      // por aquí a propósito: no tiene backoff ni tope, se reintenta siempre.
      if (op.status === 'failed') {
        if (op.attempts >= maxRetries) { result.skipped++; continue; } // dead-letter
        if (op.next_retry_at && op.next_retry_at > now) { result.skipped++; continue; }
      }

      await db.outbox.update(op.id, { status: 'syncing' });
      try {
        await pushOne(op);
        // Éxito → la op desaparece del outbox.
        await db.outbox.delete(op.id);
        result.pushed++;
      } catch (err) {
        if (err instanceof UnresolvedReferenceError) {
          // Espera legítima, no fallo: NO attempts++, NO backoff, NO dead-letter.
          await db.outbox.update(op.id, {
            status: 'waiting_ref',
            last_error: String(err.message ?? err),
          });
          result.waitingRef++;
          continue; // aislar y seguir con el resto del drenado
        }

        const attempts = op.attempts + 1;
        await db.outbox.update(op.id, {
          status: 'failed',
          attempts,
          last_error: String(err?.message ?? err),
          // Backoff exponencial: base * 2^attempts.
          next_retry_at: Date.now() + backoffBaseMs * 2 ** attempts,
        });
        result.failed++;
        // Aislar y continuar: NO abortamos el resto del drenado.
      }
    }
    return result;
  }

  // Aplica UNA op al server vía upsert por client_id.
  async function pushOne(op) {
    // Traduce FKs client_id -> id ANTES de tocar la red (ver resolveForeignKeys
    // arriba). Si el referenciado no ha sincronizado todavía, esto lanza y cae
    // en el catch de push() como cualquier fallo: 'failed' + backoff + retry.
    const payload = await resolveForeignKeys(db, op.entity, op.payload);

    // Normalizar fecha vacía → hoy. Parchea outbox entries atascados con
    // fecha="" que Postgres rechaza (invalid input syntax for type date).
    if (op.entity === 'movimientos' && (!payload.fecha || payload.fecha === '')) {
      payload.fecha = new Date().toISOString().slice(0, 10);
    }

    // 'delete' se propaga como update soft: garantizamos deleted_at seteado.
    if (op.op === 'delete' && !payload.deleted_at) {
      payload.deleted_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from(op.entity)
      .upsert(payload, { onConflict: 'client_id' });

    // Un rechazo por FK que la traducción de arriba no haya anticipado (p.ej.
    // el referenciado se borró en el server) también cae aquí como error
    // normal → 'failed' + retry, jamás fatal.
    if (error) throw new Error(error.message || 'upsert falló');
  }

  // ═══════════════════════════════════════════════════════════════════
  // PULL — trae cambios remotos y reconcilia por LWW
  // ═══════════════════════════════════════════════════════════════════
  //
  // - Por entidad: SELECT * WHERE updated_at > last_pull_at (watermark por
  //   entidad en sync_meta), INCLUYENDO filas con deleted_at (para propagar
  //   borrados remotos).
  // - Reconciliación por registro vía resolveConflict (LWW).
  // - Watermark: last_pull_at = max(updated_at VISTO en el server), NO el reloj
  //   local. Usar el timestamp del server evita el drift de reloj cliente↔PG.
  async function pull() {
    const result = { pulled: 0, applied: 0 };

    for (const entity of ENTITIES) {
      const metaKey = `last_pull_at:${entity}`;
      const since = (await getMeta(metaKey)) ?? EPOCH_ISO;

      const { data, error } = await supabase
        .from(entity)
        .select('*')
        .gt('updated_at', since)
        .order('updated_at', { ascending: true });

      if (error) throw new Error(`pull ${entity}: ${error.message || 'select falló'}`);

      const rows = data ?? [];
      let maxMs = since ? new Date(since).getTime() : -Infinity;
      let maxStr = since;

      for (const remote of rows) {
        result.pulled++;
        const applied = await reconcile(entity, remote);
        if (applied) result.applied++;

        const ms = new Date(remote.updated_at).getTime();
        if (ms > maxMs) { maxMs = ms; maxStr = remote.updated_at; }
      }

      // Avanzamos el watermark sólo al terminar la entidad sin error.
      await setMeta(metaKey, maxStr);
    }
    return result;
  }

  // Concilia UNA fila remota contra la local. Devuelve true si escribió local.
  async function reconcile(entity, remote) {
    // Identidad: client_id primario, id como fallback (filas server con
    // client_id NULL). Normalizamos client_id = id para que la PK local
    // (client_id) nunca sea nula. Ver nota de PK en db.js.
    const key = remote.client_id ?? remote.id;
    const normalized = { ...remote, client_id: key };

    // Traduce FKs devueltas por el server (id real) de vuelta a client_id
    // local, para que las queries de la UI (useFotos, etc.) sigan match.
    const fkMap = FK_FIELDS[entity];
    if (fkMap) {
      for (const [field, targetEntity] of Object.entries(fkMap)) {
        const serverId = normalized[field];
        if (serverId == null) continue;
        // Busca un registro local del target cuyo `id` = serverId.
        const target = await db[targetEntity].where('id').equals(serverId).first();
        if (target?.client_id) {
          normalized[field] = target.client_id;
        }
      }
    }

    const local = await db[entity].get(key);
    const winner = resolveConflict(local, normalized);

    if (winner === 'remote') {
      // Escribe/actualiza local (incluye aplicar deleted_at → soft-delete
      // remoto propagado). put() = upsert local por PK client_id.
      await db[entity].put(normalized);
      return true;
    }
    // Gana local: NO pisamos nada. Nuestra versión sigue en el outbox
    // esperando push; convergerá en el próximo ciclo.
    return false;
  }

  // ── Observabilidad del ciclo (PUNTO DE EXTENSIÓN #3, mínimo para 2B) ──
  // El scheduler (start/setInterval) dispara sync() directo, sin pasar por
  // la UI: para que el indicador de sync (isSyncing/lastPullAt) refleje
  // TAMBIÉN esos ciclos en segundo plano (no sólo los disparados a mano por
  // el usuario), el motor emite su propio estado en vez de que la UI
  // reimplemente el disparo. `result` va indefinido si sync() fue abortado
  // por una excepción (p.ej. pull() sin red); así el listener puede
  // distinguir "terminó" de "terminó con éxito".
  const syncListeners = new Set();
  function notifySyncState(isRunning, result) {
    for (const fn of syncListeners) {
      try { fn(isRunning, result); } catch { /* listener roto no rompe el ciclo */ }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CICLO — push luego pull, con lock de reentrada
  // ═══════════════════════════════════════════════════════════════════
  async function sync() {
    if (running) return { skipped: true, reason: 'already-running' };
    running = true;
    notifySyncState(true);
    let result;
    try {
      const pushResult = await push();
      const pullResult = await pull();
      // Después del pull, las entidades referenciadas pueden haber llegado.
      // Reseteamos waiting_ref → pending para que el próximo push las resuelva.
      if (pullResult.applied > 0) {
        const waitingRefs = await db.outbox.where('status').equals('waiting_ref').toArray();
        for (const op of waitingRefs) {
          await db.outbox.update(op.id, { status: 'pending' });
        }
      }
      result = { skipped: false, push: pushResult, pull: pullResult };
      return result;
    } finally {
      running = false;
      notifySyncState(false, result);
    }
  }

  // ── Scheduler opcional (auto-sync por intervalo) ─────────────────────
  // Efecto aislado; no arranca solo. El 2B (React) decidirá cuándo llamar
  // start()/stop() según conectividad. TODO(2B): enlazar con connectivity.
  let timer = null;
  function start(intervalMs = config.intervalMs) {
    if (timer) return;
    timer = setInterval(() => {
      // sync() ya es reentrante-seguro; si uno sigue corriendo, éste sale.
      sync().catch(() => { /* errores por-op ya quedan en outbox.last_error */ });
    }, intervalMs);
    // No bloquear el process en Node (tests) si el timer soporta unref.
    if (typeof timer?.unref === 'function') timer.unref();
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return {
    push,
    pull,
    sync,
    resolveConflict, // reexpuesto para inspección/tests
    start,
    stop,
    isRunning: () => running,
    getMeta,
    setMeta,
    // Suscripción al estado del ciclo (ver notifySyncState arriba). Usado por
    // 2B (SyncProvider) para reflejar isSyncing/lastPullAt de CUALQUIER
    // sync, manual o del scheduler. Devuelve función de desuscripción.
    onSyncStateChange(fn) {
      syncListeners.add(fn);
      return () => syncListeners.delete(fn);
    },
  };
}
