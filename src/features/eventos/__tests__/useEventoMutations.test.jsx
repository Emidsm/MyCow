import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { create } from '../../../sync/writes.js';
import { registrarDefuncion, registrarVenta } from '../useEventoMutations.js';

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

describe('registrarVenta', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  // ── 3. Alta + espejo optimista ──────────────────────────────────────────
  it('encola 1 insert y espeja estado_vida=vendido', async () => {
    const animal = await create(db, 'animales', { arete_local: '4', categoria: 'novillo' });
    await db.outbox.clear();

    let venta;
    await act(async () => {
      venta = await registrarVenta(db, {
        animal_id: animal.client_id,
        fecha_venta: '2026-07-01',
        peso_kg: '350',
        comprador: 'Rancho Vecino',
        precio: '15000',
        moneda: 'MXN',
      });
    });

    expect(venta.animal_id).toBe(animal.client_id);
    expect(venta.peso_kg).toBe(350);
    expect(venta.precio).toBe(15000);

    // 2 ops en la MISMA transacción: insert venta + update animales (espejo).
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(2);
    const ventaOp = ops.find((o) => o.entity === 'ventas');
    expect(ventaOp).toMatchObject({ op: 'insert', client_id: venta.client_id });

    const animalOp = ops.find((o) => o.entity === 'animales');
    expect(animalOp).toMatchObject({ op: 'update', client_id: animal.client_id });
    expect(animalOp.payload.estado_vida).toBe('vendido');

    const animalLocal = await db.animales.get(animal.client_id);
    expect(animalLocal.estado_vida).toBe('vendido');
  });

  it('acepta venta sin campos opcionales (peso/comprador/precio) con moneda por defecto MXN', async () => {
    const animal = await create(db, 'animales', { arete_local: '5', categoria: 'novillo' });
    await db.outbox.clear();

    const venta = await registrarVenta(db, { animal_id: animal.client_id, fecha_venta: '2026-07-01' });

    expect(venta.peso_kg).toBeNull();
    expect(venta.comprador).toBeNull();
    expect(venta.precio).toBeNull();
    expect(venta.moneda).toBe('MXN');
  });

  it('bloquea si falta fecha_venta, sin escribir nada', async () => {
    const animal = await create(db, 'animales', { arete_local: '6', categoria: 'novillo' });
    await db.outbox.clear();

    await expect(
      registrarVenta(db, { animal_id: animal.client_id, fecha_venta: '' })
    ).rejects.toThrow(/fecha de venta es obligatoria/);

    expect(await db.ventas.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  // ── Validación de números no negativos ──────────────────────────────────
  it('bloquea peso_kg negativo, sin escribir nada', async () => {
    const animal = await create(db, 'animales', { arete_local: '7', categoria: 'novillo' });
    await db.outbox.clear();

    await expect(
      registrarVenta(db, { animal_id: animal.client_id, fecha_venta: '2026-07-01', peso_kg: '-10' })
    ).rejects.toThrow(/peso.*no puede ser negativo/i);

    expect(await db.ventas.count()).toBe(0);
  });

  it('bloquea precio negativo, sin escribir nada', async () => {
    const animal = await create(db, 'animales', { arete_local: '8', categoria: 'novillo' });
    await db.outbox.clear();

    await expect(
      registrarVenta(db, { animal_id: animal.client_id, fecha_venta: '2026-07-01', precio: '-1' })
    ).rejects.toThrow(/precio.*no puede ser negativo/i);

    expect(await db.ventas.count()).toBe(0);
  });
});
