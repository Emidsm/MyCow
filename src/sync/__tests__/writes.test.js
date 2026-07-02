import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { create } from '../writes.js';
import { freshDb, dropDb } from './helpers.js';

// ── ESCENARIO 1 ──────────────────────────────────────────────────────────
// Un create local encola EXACTAMENTE una op en outbox Y persiste el registro,
// en la MISMA transacción. Si falla el encolado, el registro tampoco queda.
describe('writes.create — atomicidad local + outbox', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(async () => { await dropDb(db); });

  it('persiste el registro Y encola una única op en la misma transacción', async () => {
    const rec = await create(db, 'animales', { arete_local: '10', categoria: 'vaca', sexo: 'hembra' });

    // Registro persistido con client_id + timestamps del cliente.
    const stored = await db.animales.get(rec.client_id);
    expect(stored).toBeTruthy();
    expect(stored.client_id).toBe(rec.client_id);
    expect(stored.updated_at).toBe(rec.updated_at);
    expect(stored.deleted_at).toBeNull();

    // Exactamente UNA op en el outbox, coherente con el registro.
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      entity: 'animales',
      op: 'insert',
      client_id: rec.client_id,
      status: 'pending',
      attempts: 0,
    });
    expect(ops[0].payload.client_id).toBe(rec.client_id);
  });

  it('si falla el encolado en outbox, revierte y el registro NO queda', async () => {
    // Forzamos el fallo del segundo paso (outbox.add) dentro de la transacción.
    const originalAdd = db.outbox.add.bind(db.outbox);
    db.outbox.add = () => Promise.reject(new Error('fallo simulado en outbox'));

    await expect(
      create(db, 'animales', { arete_local: '11', categoria: 'vaca' })
    ).rejects.toThrow(/fallo simulado/);

    db.outbox.add = originalAdd; // restaurar para las aserciones

    // Rollback atómico: ni registro ni op.
    expect(await db.animales.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});
