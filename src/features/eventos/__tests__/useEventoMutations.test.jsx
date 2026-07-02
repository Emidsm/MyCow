import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { create } from '../../../sync/writes.js';
import { registrarDefuncion } from '../useEventoMutations.js';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

describe('registrarDefuncion', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  // ── 1. Alta + espejo optimista ──────────────────────────────────────────
  it('encola 1 insert con animal_id como client_id y espeja estado_vida=muerto', async () => {
    const animal = await create(db, 'animales', { arete_local: '1', categoria: 'vaca' });
    await db.outbox.clear();

    let defuncion;
    await act(async () => {
      defuncion = await registrarDefuncion(db, {
        animal_id: animal.client_id,
        fecha_muerte: '2026-07-01',
        causa: 'enfermedad',
      });
    });

    expect(defuncion.animal_id).toBe(animal.client_id);

    // 2 ops en la MISMA transacción: insert defuncion + update animales (espejo).
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(2);
    const defOp = ops.find((o) => o.entity === 'defunciones');
    expect(defOp).toMatchObject({ op: 'insert', client_id: defuncion.client_id });
    expect(defOp.payload).toMatchObject({ animal_id: animal.client_id, fecha_muerte: '2026-07-01' });

    const animalOp = ops.find((o) => o.entity === 'animales');
    expect(animalOp).toMatchObject({ op: 'update', client_id: animal.client_id });
    expect(animalOp.payload.estado_vida).toBe('muerto');

    const animalLocal = await db.animales.get(animal.client_id);
    expect(animalLocal.estado_vida).toBe('muerto');
  });

  // ── fecha requerida ──────────────────────────────────────────────────────
  it('bloquea si falta fecha_muerte, sin escribir nada', async () => {
    const animal = await create(db, 'animales', { arete_local: '2', categoria: 'vaca' });
    await db.outbox.clear();

    await expect(
      registrarDefuncion(db, { animal_id: animal.client_id, fecha_muerte: '' })
    ).rejects.toThrow(/fecha de muerte es obligatoria/);

    expect(await db.defunciones.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.animales.get(animal.client_id)).estado_vida).not.toBe('muerto');
  });

  // ── 2. Defunción duplicada ───────────────────────────────────────────────
  it('bloquea una segunda defunción para el mismo animal, con mensaje claro', async () => {
    const animal = await create(db, 'animales', { arete_local: '3', categoria: 'vaca' });
    await registrarDefuncion(db, { animal_id: animal.client_id, fecha_muerte: '2026-07-01' });
    await db.outbox.clear();

    await expect(
      registrarDefuncion(db, { animal_id: animal.client_id, fecha_muerte: '2026-07-02' })
    ).rejects.toThrow(/ya tiene una defunción registrada/);

    expect(await db.defunciones.where('animal_id').equals(animal.client_id).count()).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });
});


