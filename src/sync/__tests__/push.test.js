import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { create } from '../writes.js';
import { createEngine } from '../engine.js';
import { freshDb, dropDb, createMockSupabase } from './helpers.js';

describe('engine.push — drenado, aislamiento de fallos e idempotencia', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(async () => { await dropDb(db); });

  // ── ESCENARIO 2 ────────────────────────────────────────────────────────
  // push() drena el outbox y limpia las ops exitosas; una op fallida queda
  // como 'failed' con attempts++ y NO bloquea el resto del drenado.
  it('limpia las exitosas y aísla la fallida sin bloquear el drenado', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 5, backoffBaseMs: 1000 } });

    await create(db, 'potreros', { nombre: 'Morones' });   // op #1 (id=1)
    await create(db, 'potreros', { nombre: 'Mesas' });      // op #2 (id=2)

    // La PRIMERA upsert (op #1, orden por id) falla una vez.
    supabase.failUpsertOnce('boom');

    const res = await engine.push();

    expect(res.pushed).toBe(1);
    expect(res.failed).toBe(1);

    const ops = await db.outbox.toArray();
    // Sólo queda la fallida; la exitosa fue borrada.
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ status: 'failed', attempts: 1, entity: 'potreros' });
    expect(ops[0].last_error).toMatch(/boom/);
    expect(ops[0].next_retry_at).toBeGreaterThan(Date.now());

    // La op exitosa sí llegó al server.
    expect(supabase._tables.potreros).toHaveLength(1);
    expect(supabase._tables.potreros[0].nombre).toBe('Mesas');
  });

  // ── ESCENARIO 3 ────────────────────────────────────────────────────────
  // Reintentar una op ya aplicada (mismo client_id) es idempotente: no duplica.
  it('reintentar una op ya aplicada por client_id no duplica en el server', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 5, backoffBaseMs: 1000 } });

    const rec = await create(db, 'potreros', { nombre: 'Sierra' });
    await engine.push();

    expect(supabase._tables.potreros).toHaveLength(1);

    // Simulamos un corte a media transacción de red: el server aplicó la op
    // pero el outbox no se limpió → la re-encolamos y volvemos a drenar.
    await db.outbox.add({
      entity: 'potreros', op: 'insert', client_id: rec.client_id,
      payload: rec, created_at: rec.created_at, attempts: 0,
      last_error: null, status: 'pending', next_retry_at: null,
    });
    await engine.push();

    // Upsert onConflict:'client_id' → sigue habiendo UNA sola fila.
    expect(supabase._tables.potreros).toHaveLength(1);
    expect(supabase._tables.potreros[0].client_id).toBe(rec.client_id);
    // Y el outbox quedó vacío tras el segundo drenado.
    expect(await db.outbox.count()).toBe(0);
  });
});
