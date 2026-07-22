import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { create, update } from '../../../sync/writes.js';
import { registrarMovimiento, corregirLote } from '../useMovimientoMutations.js';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

describe('registrarMovimiento', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  // ── 1. Encola 1 op insert con las 3 FK por client_id + espejo local ────
  it('encola 1 insert con animal_id/potrero_origen_id/potrero_destino_id como client_id y actualiza el espejo local', async () => {
    const origen = await create(db, 'potreros', { nombre: 'Morones' });
    const destino = await create(db, 'potreros', { nombre: 'El Jagüey' });
    const animal = await create(db, 'animales', {
      arete_local: '300', categoria: 'cria', potrero_actual_id: origen.client_id,
    });
    await db.outbox.clear(); // aislar sólo las ops del movimiento

    let movimiento;
    await act(async () => {
      movimiento = await registrarMovimiento(db, {
        animal_id: animal.client_id,
        potrero_destino_id: destino.client_id,
        fecha: '2026-07-01',
      });
    });

    expect(movimiento.animal_id).toBe(animal.client_id);
    expect(movimiento.potrero_origen_id).toBe(origen.client_id);
    expect(movimiento.potrero_destino_id).toBe(destino.client_id);

    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(2); // insert movimiento + update animal (espejo)
    const movOp = ops.find((o) => o.entity === 'movimientos');
    expect(movOp).toMatchObject({ op: 'insert', client_id: movimiento.client_id });
    expect(movOp.payload).toMatchObject({
      animal_id: animal.client_id,
      potrero_origen_id: origen.client_id,
      potrero_destino_id: destino.client_id,
    });

    const animalOp = ops.find((o) => o.entity === 'animales');
    expect(animalOp).toMatchObject({ op: 'update', client_id: animal.client_id });
    expect(animalOp.payload.potrero_actual_id).toBe(destino.client_id);

    const animalLocal = await db.animales.get(animal.client_id);
    expect(animalLocal.potrero_actual_id).toBe(destino.client_id);
  });

  // ── 2. Origen autodetectado: NULL permitido (alta) ──────────────────────
  it('origen autodetectado: si el animal no tiene potrero_actual_id, el movimiento nace con origen NULL', async () => {
    const destino = await create(db, 'potreros', { nombre: 'El Salto' });
    const animal = await create(db, 'animales', { arete_local: '10', categoria: 'vaca' });
    await db.outbox.clear();

    const movimiento = await registrarMovimiento(db, {
      animal_id: animal.client_id,
      potrero_destino_id: destino.client_id,
      fecha: '2026-07-01',
    });

    expect(movimiento.potrero_origen_id).toBeNull();
    expect(movimiento.potrero_destino_id).toBe(destino.client_id);
  });

  // ── 3. Validación destino == origen ──────────────────────────────────────
  it('bloquea el guardado si destino == origen, con mensaje claro, sin escribir nada', async () => {
    const potrero = await create(db, 'potreros', { nombre: 'Mesas' });
    const animal = await create(db, 'animales', {
      arete_local: '5', categoria: 'vaca', potrero_actual_id: potrero.client_id,
    });
    await db.outbox.clear();

    await expect(
      registrarMovimiento(db, {
        animal_id: animal.client_id,
        potrero_destino_id: potrero.client_id,
        fecha: '2026-07-01',
      })
    ).rejects.toThrow(/distinto del potrero de origen/);

    expect(await db.movimientos.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.animales.get(animal.client_id)).potrero_actual_id).toBe(potrero.client_id);
  });

  it('bloquea el guardado si no se elige destino', async () => {
    const animal = await create(db, 'animales', { arete_local: '6', categoria: 'vaca' });
    await db.outbox.clear();

    await expect(
      registrarMovimiento(db, { animal_id: animal.client_id, potrero_destino_id: null, fecha: '2026-07-01' })
    ).rejects.toThrow(/potrero destino es obligatorio/);

    expect(await db.movimientos.count()).toBe(0);
  });

  // ── 4. Animal creado en la misma sesión offline (sin id real aún) ───────
  it('permite registrar el movimiento de un animal recién creado offline (sin id real), encolado por client_id', async () => {
    const destino = await create(db, 'potreros', { nombre: 'El Jagüey' });
    const animal = await create(db, 'animales', { arete_local: '92', categoria: 'cria' }); // sin `id` (sin pull todavía)

    const movimiento = await registrarMovimiento(db, {
      animal_id: animal.client_id,
      potrero_destino_id: destino.client_id,
      fecha: '2026-07-01',
    });

    expect(movimiento.animal_id).toBe(animal.client_id);
    const ops = await db.outbox.toArray();
    expect(ops.find((o) => o.entity === 'movimientos').client_id).toBe(movimiento.client_id);
  });
});

describe('corregirLote', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  async function setupLote() {
    const potreroMalo = await create(db, 'potreros', { nombre: 'Malo' });
    const potreroBueno = await create(db, 'potreros', { nombre: 'Bueno' });
    const a1 = await create(db, 'animales', {
      arete_local: '1', categoria: 'vaca', potrero_actual_id: potreroMalo.client_id, estado_vida: 'activo',
    });
    const a2 = await create(db, 'animales', {
      arete_local: '2', categoria: 'vaca', potrero_actual_id: potreroMalo.client_id, estado_vida: 'activo',
    });
    const a3 = await create(db, 'animales', {
      arete_local: '3', categoria: 'vaca', potrero_actual_id: potreroMalo.client_id, estado_vida: 'muerto',
    });
    await db.outbox.clear();
    return { potreroMalo, potreroBueno, a1, a2, a3 };
  }

  it('mueve todos los animales activos de un potrero a otro', async () => {
    const { potreroMalo, potreroBueno, a1, a2 } = await setupLote();

    const moved = await corregirLote(db, {
      potrero_origen_id: potreroMalo.client_id,
      potrero_destino_id: potreroBueno.client_id,
      fecha: '2026-07-22',
    });

    expect(moved).toBe(2);
    expect((await db.animales.get(a1.client_id)).potrero_actual_id).toBe(potreroBueno.client_id);
    expect((await db.animales.get(a2.client_id)).potrero_actual_id).toBe(potreroBueno.client_id);
  });

  it('skipea animales muertos/inactivos (lanza error si no quedan activos)', async () => {
    const potreroMalo = await create(db, 'potreros', { nombre: 'Malo2' });
    const potreroBueno = await create(db, 'potreros', { nombre: 'Bueno2' });
    await create(db, 'animales', {
      arete_local: '3', categoria: 'vaca', potrero_actual_id: potreroMalo.client_id, estado_vida: 'muerto',
    });
    await db.outbox.clear();

    await expect(
      corregirLote(db, {
        potrero_origen_id: potreroMalo.client_id,
        potrero_destino_id: potreroBueno.client_id,
        fecha: '2026-07-22',
      })
    ).rejects.toThrow(/No hay animales activos/);
  });

  it('mezcla de activos y muertos: solo mueve los activos', async () => {
    const potreroMalo = await create(db, 'potreros', { nombre: 'Mix' });
    const potreroBueno = await create(db, 'potreros', { nombre: 'Bueno3' });
    const vivo = await create(db, 'animales', {
      arete_local: 'v1', categoria: 'vaca', potrero_actual_id: potreroMalo.client_id, estado_vida: 'activo',
    });
    const muerto = await create(db, 'animales', {
      arete_local: 'm1', categoria: 'vaca', potrero_actual_id: potreroMalo.client_id, estado_vida: 'muerto',
    });
    await db.outbox.clear();

    const moved = await corregirLote(db, {
      potrero_origen_id: potreroMalo.client_id,
      potrero_destino_id: potreroBueno.client_id,
      fecha: '2026-07-22',
    });

    expect(moved).toBe(1);
    expect((await db.animales.get(vivo.client_id)).potrero_actual_id).toBe(potreroBueno.client_id);
    expect((await db.animales.get(muerto.client_id)).potrero_actual_id).toBe(potreroMalo.client_id);
  });

  it('encola ops: N inserts movimientos + N updates animales', async () => {
    const { potreroMalo, potreroBueno } = await setupLote();

    await corregirLote(db, {
      potrero_origen_id: potreroMalo.client_id,
      potrero_destino_id: potreroBueno.client_id,
      fecha: '2026-07-22',
    });

    const ops = await db.outbox.toArray();
    const insertOps = ops.filter((o) => o.op === 'insert' && o.entity === 'movimientos');
    const updateOps = ops.filter((o) => o.op === 'update' && o.entity === 'animales');
    expect(insertOps).toHaveLength(2);
    expect(updateOps).toHaveLength(2);
  });

  it('lanza error si origen == destino', async () => {
    const potrero = await create(db, 'potreros', { nombre: 'X' });

    await expect(
      corregirLote(db, {
        potrero_origen_id: potrero.client_id,
        potrero_destino_id: potrero.client_id,
        fecha: '2026-07-22',
      })
    ).rejects.toThrow(/distinto del potrero de origen/);
  });

  it('lanza error si no hay animales activos en el potrero origen', async () => {
    const potreroMalo = await create(db, 'potreros', { nombre: 'Vacío' });
    const potreroBueno = await create(db, 'potreros', { nombre: 'Bueno' });

    await expect(
      corregirLote(db, {
        potrero_origen_id: potreroMalo.client_id,
        potrero_destino_id: potreroBueno.client_id,
        fecha: '2026-07-22',
      })
    ).rejects.toThrow(/No hay animales activos/);
  });

  it('lanza error si no se elige destino', async () => {
    const potrero = await create(db, 'potreros', { nombre: 'X' });

    await expect(
      corregirLote(db, {
        potrero_origen_id: potrero.client_id,
        potrero_destino_id: null,
        fecha: '2026-07-22',
      })
    ).rejects.toThrow(/potrero destino es obligatorio/);
  });
});
