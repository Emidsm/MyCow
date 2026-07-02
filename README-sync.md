# Motor de sincronización offline — `src/sync`

Capa **headless** (sin React) que da persistencia offline-first a MyCow: una
base local IndexedDB (Dexie) que espeja las 8 tablas de Postgres, un **outbox**
de operaciones salientes y un ciclo **push → pull** con reconciliación
**last-write-wins (LWW)**.

Es importable y testeable en aislamiento. La UI y los hooks de React son el
PROMPT 2B; aquí no hay nada de UI.

---

## Estructura

```
src/sync/
  config.js        Config desde import.meta.env (CERO hardcoding) + defaults.
  db.js            Schema Dexie: 8 stores de dominio + outbox + sync_meta.
  writes.js        Escrituras locales ATÓMICAS (registro local + outbox en 1 tx).
  engine.js        push, pull, resolveConflict, sync, lock de reentrada, scheduler.
  connectivity.js  Emitter online/offline (sin React).
  index.js         API pública: ata db singleton + supabase real + config.
  __tests__/       Los 7 escenarios obligatorios (+ extras) con fake-indexeddb.
```

---

## Modelo de datos local

- **PK local = `client_id`** (no `id`). Es el único identificador presente al
  crear offline (lo genera el dispositivo con `uuidv4`); el `id` de Postgres
  se asigna con `gen_random_uuid()` y sólo se conoce tras un pull. `client_id`
  es además la clave de upsert (`onConflict:'client_id'`), así la identidad
  local y la del protocolo de sync son la misma. `id` sigue indexado.
  (Detalle completo en el comentario de cabecera de `db.js`.)
- Cada store indexa `client_id` (PK), `id`, `updated_at`, `deleted_at` y las
  FKs que se consultan (`animal_id`, `madre_id`, etc.).
- **Nunca hard-delete**: `softDelete` setea `deleted_at`; la UI filtra
  `deleted_at IS NULL`.

### `outbox` (no existe en Postgres)
Cola de operaciones salientes. Es la **única** fuente de escrituras al server:
ningún write toca Supabase directo. Campos: `id` (autoincrement local),
`entity`, `op` (`insert|update|delete`), `client_id`, `payload` (snapshot
completo del registro), `created_at`, `attempts`, `last_error`, `status`
(`pending|syncing|failed`) y `next_retry_at` (backoff).

### `sync_meta`
Pares `{ key, value }`. Guarda los watermarks `last_pull_at:<entidad>`.

---

## Escrituras locales atómicas (`writes.js`)

`create` / `update` / `softDelete` hacen **dos cosas en UNA transacción Dexie**
(`rw` sobre el store + `outbox`): escriben el registro **y** encolan la op.
O entran las dos o no entra ninguna — si el encolado falla, la transacción
revierte y el registro tampoco queda. Cada write refresca `updated_at` con el
reloj del cliente (el server lo re-sella, pero el cliente necesita su propio
reloj para competir en el LWW).

```js
import { writes } from './src/sync/index.js';
const cria = await writes.animales.create({ arete_local: '92', categoria: 'cria' });
await writes.animales.update(cria.client_id, { color: 'colorado' });
await writes.animales.softDelete(cria.client_id);
```

---

## Ciclo de sync (`engine.js`)

`sync() = push() → pull()`, **secuencial**, nunca en paralelo.

### ¿Por qué push ANTES que pull?
Si hiciéramos pull primero podríamos traernos del server una versión vieja de
un registro que acabamos de editar localmente pero que **aún no hemos empujado**
(sigue en el outbox), generando conflictos o trabajo redundante. Drenando el
outbox primero, el server ya tiene lo nuestro y el pull sólo trae novedades
reales de otros dispositivos.

### PUSH (drenar outbox)
- Orden de drenado: por `outbox.id` autoincrement = **orden causal** de encolado
  (más fiable que `created_at`, que puede empatar al milisegundo).
- Cada op → `upsert(payload, { onConflict:'client_id' })`. `delete` viaja como
  update con `deleted_at` (soft).
- **Idempotencia**: reintentar una op ya aplicada es un no-op (upsert por
  `client_id`). Esto hace el sync robusto ante cortes de red a media transacción.
- **Aislamiento de fallos**: una op que falla no detiene el resto del drenado.
  Se marca `failed`, `attempts++`, se guarda `last_error` y se programa el
  backoff (`next_retry_at = now + base * 2^attempts`). Al superar
  `maxRetries` queda como **dead-letter** (no se reintenta sola).
- Un rechazo por FK del server (no debería ocurrir: no validamos FK en INSERT)
  se trata como `failed` + retry, **nunca** como error fatal.

### PULL (traer cambios remotos)
- Por entidad: `SELECT * WHERE updated_at > last_pull_at`, incluyendo filas con
  `deleted_at` (para propagar borrados remotos).
- Reconciliación por registro con `resolveConflict` (LWW).
- **Watermark**: `last_pull_at = max(updated_at VISTO en el server)`, nunca el
  reloj local. Usar el timestamp del server evita el drift de reloj
  cliente↔Postgres.
- Filas remotas con `client_id` NULL se normalizan a `client_id = id` antes de
  guardar, para que la PK local nunca sea nula.

### Reentrada protegida
`sync()` usa un flag síncrono (`running`): si ya hay un ciclo en curso, una
segunda llamada devuelve `{ skipped: true }` sin arrancar otro. JS es monohilo,
así que el flag se fija antes del primer `await`.

---

## Cómo cambiar la regla de conflicto (UN solo lugar)

La conciliación vive **centralizada** en `resolveConflict(local, remote)` en
`engine.js`, marcada como **PUNTO DE EXTENSIÓN #1**. Devuelve `'remote'` o
`'local'`:

- Sin copia local → gana remoto. Sin copia remota → gana local.
- `updated_at` más reciente gana (comparado por **epoch-ms**, no lexicográfico:
  el server puede devolver `+00:00` y el cliente `Z`).
- **Empate** (mismo `updated_at`, distinto contenido) → **gana remoto**, por ser
  la fuente convergente compartida por todos los dispositivos.

Para cambiar la política (p.ej. a un *merge* campo-a-campo, o "gana el de mayor
`attempts`") edita **sólo ese bloque**. El otro punto que más se tocará es el
**orden causal del outbox** (drenado por `id`), marcado como **PUNTO DE
EXTENSIÓN #2** en `engine.push`.

> **Limitación conocida del LWW**: la comparación `updated_at` local vs remoto
> cruza dos relojes distintos (dispositivo y Postgres). Es inherente al LWW; si
> el drift importa, la vía es mover el sellado de `updated_at` 100% al server y
> reconciliar por versión monotónica — cambio localizado en `resolveConflict`.

---

## Configuración (CERO hardcoding)

Todo desde `import.meta.env` con defaults en `config.js` y documentado en
`.env.example`:

| Variable                   | Default      | Qué controla                          |
|----------------------------|--------------|---------------------------------------|
| `VITE_SYNC_DB_NAME`        | `mycow_sync` | Nombre de la base Dexie local         |
| `VITE_SYNC_INTERVAL_MS`    | `30000`      | Cadencia del auto-sync (scheduler)    |
| `VITE_SYNC_MAX_RETRIES`    | `5`          | Reintentos antes de dead-letter       |
| `VITE_SYNC_BACKOFF_BASE_MS`| `1000`       | Base del backoff exponencial          |

---

## Uso desde la app (2B)

```js
import { engine, writes, connectivity } from './src/sync/index.js';

await writes.movimientos.create({ animal_id, potrero_destino_id, fecha });
await engine.sync();                 // push + pull manual
engine.start();                      // auto-sync por intervalo
connectivity.subscribe((online) => { /* TODO(2B): refrescar UI */ });
```

Los **tests** no importan `index.js` (dispararía el fail-fast de env de
Supabase): importan `db.js`/`writes.js`/`engine.js` e inyectan una base Dexie
aislada + un mock de Supabase en memoria.

---

## Tests

```bash
npm test          # vitest run  (fake-indexeddb, sin red real)
```

Cubren los 7 escenarios obligatorios:

1. `writes.test.js` — create atómico: persiste + encola en 1 tx; si falla el
   encolado, revierte todo.
2. `push.test.js` — drena y limpia exitosas; la fallida queda `failed`
   (`attempts++`) y no bloquea el resto.
3. `push.test.js` — reintentar una op ya aplicada es idempotente (no duplica).
4. `pull.test.js` — LWW: remoto nuevo pisa local; local nuevo se conserva.
5. `pull.test.js` — soft-delete remoto se propaga al local.
6. `ordering.test.js` — cría antes que su madre no produce error fatal.
7. `reentrancy.test.js` — dos `sync()` concurrentes no corren dos ciclos.

(+ extras: normalización de `client_id` NULL y FK rechazada → retry no fatal.)
