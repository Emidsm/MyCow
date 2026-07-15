import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { create } from '../../../sync/writes.js';
import { createEngine } from '../../../sync/engine.js';
import { freshDb, dropDb, createMockSupabase } from '../../../sync/__tests__/helpers.js';

// movimientos estrena el patrón de referencias con TRES FK en una sola op
// (animal_id, potrero_origen_id, potrero_destino_id -> ver FK_FIELDS.movimientos
// en sync/engine.js). Mismo contrato que ordering.test.js para animales:
// una FK no resuelta es 'waiting_ref' (espera legítima), nunca 'failed'.
describe('engine.push — movimientos con 3 FK (animal_id, potrero_origen_id, potrero_destino_id)', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('con las 3 FK ya sincronizadas (con id real), push traduce las 3 y envía bien', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 5, backoffBaseMs: 1000 } });

    await db.animales.put({
      client_id: 'animal-cid', id: 'animal-real-id',
      categoria: 'cria', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });
    await db.potreros.put({
      client_id: 'origen-cid', id: 'origen-real-id',
      nombre: 'Morones', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });
    await db.potreros.put({
      client_id: 'destino-cid', id: 'destino-real-id',
      nombre: 'El Jagüey', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    const mov = await create(db, 'movimientos', {
      animal_id: 'animal-cid',
      potrero_origen_id: 'origen-cid',
      potrero_destino_id: 'destino-cid',
      fecha: '2025-09-07',
    });

    const res = await engine.push();

    expect(res.pushed).toBe(1);
    expect(res.failed).toBe(0);
    expect(res.waitingRef).toBe(0);

    const [remoteRow] = supabase._tables.movimientos.filter((r) => r.client_id === mov.client_id);
    expect(remoteRow).toMatchObject({
      animal_id: 'animal-real-id',
      potrero_origen_id: 'origen-real-id',
      potrero_destino_id: 'destino-real-id',
    });
  });

  it('con una FK sin resolver (potrero_destino_id aún no sincronizado): waiting_ref, sin attempts++, converge cuando llega', async () => {
    const supabase = createMockSupabase();
    const engine = createEngine({ db, supabase, config: { maxRetries: 3, backoffBaseMs: 1000 } });

    await db.animales.put({
      client_id: 'animal-cid', id: 'animal-real-id',
      categoria: 'cria', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });
    await db.potreros.put({
      client_id: 'origen-cid', id: 'origen-real-id',
      nombre: 'Morones', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });
    // potrero destino creado offline, todavía SIN id real (no completó su pull).
    const destino = await create(db, 'potreros', { nombre: 'El Salto' });

    const mov = await create(db, 'movimientos', {
      animal_id: 'animal-cid',
      potrero_origen_id: 'origen-cid',
      potrero_destino_id: destino.client_id,
      fecha: '2025-09-07',
    });
    // Aislamos: sólo nos interesa el movimiento, no el insert del potrero destino.
    await db.outbox.where('client_id').equals(destino.client_id).delete();

    const res = await engine.push();

    expect(res.pushed).toBe(0);
    expect(res.failed).toBe(0);
    expect(res.waitingRef).toBe(1);

    const [op] = await db.outbox.where('client_id').equals(mov.client_id).toArray();
    expect(op.status).toBe('waiting_ref');
    expect(op.attempts).toBe(0);
    expect(op.next_retry_at).toBeFalsy();
    expect(supabase._tables.movimientos).toHaveLength(0);

    // El potrero destino "sincroniza" (simula el efecto de un pull: id real local).
    await db.potreros.update(destino.client_id, { id: 'destino-real-id-tardio' });

    const res2 = await engine.push();
    expect(res2.pushed).toBe(1);
    expect(res2.waitingRef).toBe(0);
    expect(await db.outbox.count()).toBe(0);

    const [remoteRow] = supabase._tables.movimientos.filter((r) => r.client_id === mov.client_id);
    expect(remoteRow.potrero_destino_id).toBe('destino-real-id-tardio');
  });
});
