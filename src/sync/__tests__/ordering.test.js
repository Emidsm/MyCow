import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { create } from '../writes.js';
import { createEngine } from '../engine.js';
import { freshDb, dropDb, createMockSupabase } from './helpers.js';

// ── ESCENARIO 6 ──────────────────────────────────────────────────────────
// Orden desordenado + traducción de FKs client_id -> id (ver engine.js
// resolveForeignKeys). Localmente TODO se referencia por client_id; el
// server exige id real (REFERENCES animales(id) en 0002_tables.sql). pushOne
// traduce antes de tocar la red.
//
// Una referencia no resuelta (el referenciado aún no sincronizó) es un
// estado de ESPERA ('waiting_ref'), NO un fallo: no incrementa `attempts`,
// no tiene backoff, NUNCA llega a dead-letter (ver UnresolvedReferenceError
// en engine.js). Sólo un error real (red, rechazo del server) usa
// 'failed'/attempts/backoff/tope de reintentos.
describe('engine.push — orden causal / llegada desordenada (hijo antes que padre)', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(async () => { await dropDb(db); });

  it('cría cuya madre_id (client_id) no existe localmente: queda waiting_ref, no failed', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 5, backoffBaseMs: 1000 } });

    const cria = await create(db, 'animales', {
      arete_local: '92', categoria: 'cria', sexo: 'macho',
      madre_id: 'madre-client-id-inexistente',
    });

    // No debe lanzar (push() aísla el fallo); no llega al server.
    const res = await engine.push();

    expect(res.pushed).toBe(0);
    expect(res.failed).toBe(0);
    expect(res.waitingRef).toBe(1);
    expect(supabase._tables.animales).toHaveLength(0);

    const [op] = await db.outbox.toArray();
    expect(op.status).toBe('waiting_ref');
    expect(op.attempts).toBe(0); // NO cuenta como intento fallido
    expect(op.next_retry_at).toBeFalsy(); // sin backoff
    expect(op.client_id).toBe(cria.client_id);
    expect(op.last_error).toMatch(/no existe localmente/);
  });

  it('madre existe local pero aún sin id real (no completó su propio pull): waiting_ref, no failed', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 5, backoffBaseMs: 1000 } });

    // Madre creada localmente (client_id), todavía no pasó por un pull → sin `id`.
    const madre = await create(db, 'animales', { arete_local: '1', categoria: 'vaca', sexo: 'hembra' });
    await create(db, 'animales', {
      arete_local: '92', categoria: 'cria', sexo: 'macho', madre_id: madre.client_id,
    });

    const res = await engine.push();

    // La madre sí se empuja con éxito; la cría queda 'waiting_ref' (no 'failed').
    expect(res.pushed).toBe(1);
    expect(res.failed).toBe(0);
    expect(res.waitingRef).toBe(1);

    const waitingOps = await db.outbox.where('status').equals('waiting_ref').toArray();
    expect(waitingOps).toHaveLength(1);
    expect(waitingOps[0].attempts).toBe(0);
    expect(waitingOps[0].last_error).toMatch(/aún no tiene id real/);

    expect(await db.outbox.where('status').equals('failed').count()).toBe(0);
  });

  it('traduce madre_id (client_id local) al id real de la madre ya sincronizada', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase });

    // Madre ya sincronizada: su registro local tiene `id` real (post-pull).
    await db.animales.put({
      client_id: 'madre-cid', id: 'madre-real-id',
      categoria: 'vaca', sexo: 'hembra', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    const cria = await create(db, 'animales', {
      arete_local: '92', categoria: 'cria', sexo: 'macho', madre_id: 'madre-cid',
    });

    const res = await engine.push();

    expect(res.pushed).toBe(1);
    expect(res.failed).toBe(0);
    expect(res.waitingRef).toBe(0);
    const [remoteRow] = supabase._tables.animales.filter((r) => r.client_id === cria.client_id);
    // El server recibe el id REAL de la madre, no su client_id local.
    expect(remoteRow.madre_id).toBe('madre-real-id');
  });

  it('autosana sin intervención: la cría en waiting_ref se envía sola en el siguiente ciclo una vez la madre tiene id local', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 5, backoffBaseMs: 1000 } });

    const madre = await create(db, 'animales', { arete_local: '1', categoria: 'vaca', sexo: 'hembra' });
    await create(db, 'animales', {
      arete_local: '92', categoria: 'cria', sexo: 'macho', madre_id: madre.client_id,
    });

    await engine.push(); // madre pushed; cría queda 'waiting_ref' (madre sin id local todavía)
    expect(await db.outbox.count()).toBe(1);
    expect((await db.outbox.toArray())[0].status).toBe('waiting_ref');

    // Simula lo que haría un pull(): la madre vuelve con su id real asignado por el server.
    const [madreRemota] = supabase._tables.animales.filter((r) => r.client_id === madre.client_id);
    await db.animales.update(madre.client_id, { id: madreRemota.id });

    // Sin manipular backoff ni next_retry_at: waiting_ref se reintenta siempre,
    // en el siguiente ciclo, sin ayuda externa.
    const res2 = await engine.push();
    expect(res2.pushed).toBe(1);
    expect(res2.failed).toBe(0);
    expect(res2.waitingRef).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  // ── PUNTO CRÍTICO DE LA AUDITORÍA ────────────────────────────────────────
  // Una referencia no resuelta debe sobrevivir MÁS ciclos que maxRetries sin
  // ser descartada (nunca dead-letter), y enviarse en cuanto la referencia
  // aparece — sin importar cuántos ciclos haya esperado antes.
  it('una FK no resuelta sobrevive más ciclos que maxRetries sin ser descartada, y se envía cuando la referencia aparece', async () => {
    const maxRetries = 3;
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries, backoffBaseMs: 1000 } });

    const madre = await create(db, 'animales', { arete_local: '1', categoria: 'vaca', sexo: 'hembra' });
    const cria = await create(db, 'animales', {
      arete_local: '92', categoria: 'cria', sexo: 'macho', madre_id: madre.client_id,
    });

    // Corremos push() muchas más veces que maxRetries. Si esto fuera tratado
    // como fallo real, al llegar attempts>=maxRetries la op quedaría
    // dead-letter (skip permanente) y desaparecería de la posibilidad de
    // reintento — exactamente lo que la Opción 3 debía evitar.
    for (let i = 0; i < maxRetries + 5; i++) {
      await engine.push();
    }

    const [op] = await db.outbox.where('client_id').equals(cria.client_id).toArray();
    expect(op).toBeTruthy(); // sigue viva, no fue descartada
    expect(op.status).toBe('waiting_ref');
    expect(op.attempts).toBe(0); // nunca contó como intento fallido, pese a >maxRetries ciclos

    // La madre "sincroniza" (simulamos el efecto de un pull: id real local).
    const [madreRemota] = supabase._tables.animales.filter((r) => r.client_id === madre.client_id);
    await db.animales.update(madre.client_id, { id: madreRemota.id });

    const res = await engine.push();
    expect(res.pushed).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it('si el server rechazara por FK ya traducida, se trata como failed+retry real (con tope), nunca fatal', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 5, backoffBaseMs: 1000 } });

    // Madre ya sincronizada (con id real) para que la traducción SÍ resuelva
    // y la op llegue hasta el upsert real, donde forzamos el rechazo.
    await db.animales.put({
      client_id: 'madre-cid', id: 'madre-real-id',
      categoria: 'vaca', sexo: 'hembra', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });
    await create(db, 'animales', {
      arete_local: '99', categoria: 'cria', madre_id: 'madre-cid',
    });

    supabase.failUpsertOnce('insert or update violates foreign key constraint');

    const res = await engine.push();
    expect(res.failed).toBe(1);
    expect(res.waitingRef).toBe(0);

    const [op] = await db.outbox.toArray();
    expect(op.status).toBe('failed'); // fallo REAL: attempts++/backoff/tope sí aplican
    expect(op.attempts).toBe(1);
    expect(op.last_error).toMatch(/foreign key/);
  });
});
