import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { useAnimalMutations } from '../useAnimalMutations.js';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

describe('useAnimalMutations', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  // ── 1. Crear animal ─────────────────────────────────────────────────────
  it('createAnimal: genera client_id, persiste local y encola 1 insert en outbox', async () => {
    const { result } = renderHook(() => useAnimalMutations(db));

    let created;
    await act(async () => {
      created = await result.current.createAnimal({
        arete_local: '10', categoria: 'vaca', sexo: 'hembra',
      });
    });

    expect(created.client_id).toBeTruthy();

    const stored = await db.animales.get(created.client_id);
    expect(stored).toMatchObject({ arete_local: '10', categoria: 'vaca', sexo: 'hembra' });
    expect(stored.deleted_at).toBeNull();

    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: 'animales', op: 'insert', status: 'pending' });
  });

  // ── 2. CHECK local semental => macho ────────────────────────────────────
  it('createAnimal: bloquea un semental hembra antes de llegar al outbox', async () => {
    const { result } = renderHook(() => useAnimalMutations(db));

    await expect(
      act(async () => {
        await result.current.createAnimal({ categoria: 'semental', sexo: 'hembra' });
      })
    ).rejects.toThrow(/semental/i);

    expect(await db.animales.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('updateAnimal: bloquea ascender a semental si el sexo sigue siendo hembra', async () => {
    const { result } = renderHook(() => useAnimalMutations(db));

    let cria;
    await act(async () => {
      cria = await result.current.createAnimal({ categoria: 'cria', sexo: 'hembra' });
    });
    await db.outbox.clear(); // aislar el intento de update

    await expect(
      act(async () => {
        await result.current.updateAnimal(cria.client_id, { categoria: 'semental' });
      })
    ).rejects.toThrow(/semental/i);

    expect(await db.outbox.count()).toBe(0);
    expect((await db.animales.get(cria.client_id)).categoria).toBe('cria'); // no se tocó
  });

  // ── 3. Ascenso cría -> vaca: 2 ops + historial correcto ─────────────────
  it('updateAnimal: cria->vaca encola 2 ops y crea historial_categoria con categoria_anterior correcta', async () => {
    const { result } = renderHook(() => useAnimalMutations(db));

    let cria;
    await act(async () => {
      cria = await result.current.createAnimal({ arete_local: '92', categoria: 'cria', sexo: 'hembra' });
    });
    await db.outbox.clear(); // sólo nos interesan las ops del update, no las del create

    await act(async () => {
      await result.current.updateAnimal(cria.client_id, { categoria: 'vaca' });
    });

    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => o.entity).sort()).toEqual(['animales', 'historial_categoria']);
    // Orden causal del outbox: el update del animal se encola antes que el historial.
    expect(ops[0].entity).toBe('animales');
    expect(ops[0].op).toBe('update');
    expect(ops[1].entity).toBe('historial_categoria');
    expect(ops[1].op).toBe('insert');

    expect((await db.animales.get(cria.client_id)).categoria).toBe('vaca');

    const [historial] = await db.historial_categoria.toArray();
    expect(historial).toMatchObject({
      animal_id: cria.client_id,
      categoria_anterior: 'cria',
      categoria_nueva: 'vaca',
    });
    expect(historial.fecha).toBeTruthy();
  });

  // ── 4. Editar sin cambiar categoria: no toca historial_categoria ───────
  it('updateAnimal: si categoria no cambia, no escribe en historial_categoria', async () => {
    const { result } = renderHook(() => useAnimalMutations(db));

    let vaca;
    await act(async () => {
      vaca = await result.current.createAnimal({ arete_local: '1', categoria: 'vaca', sexo: 'hembra' });
    });
    await db.outbox.clear();

    await act(async () => {
      await result.current.updateAnimal(vaca.client_id, { observaciones: 'cojea de la pata trasera' });
    });

    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0].entity).toBe('animales');
    expect(await db.historial_categoria.count()).toBe(0);
  });

  // ── 5. madre_id/padre_id offline-safe ───────────────────────────────────
  it('createAnimal: madre_id apuntando a cualquier animal no bloquea; padre_id NULL permitido', async () => {
    const { result } = renderHook(() => useAnimalMutations(db));

    // "Madre" deliberadamente atípica: un novillo (no vaca/novillona), simula
    // datos de campo imperfectos. NO debe bloquear el guardado.
    let madreAtipica;
    await act(async () => {
      madreAtipica = await result.current.createAnimal({ categoria: 'novillo', sexo: 'macho' });
    });

    let cria;
    await act(async () => {
      cria = await result.current.createAnimal({
        categoria: 'cria', sexo: 'macho',
        madre_id: madreAtipica.client_id,
        padre_id: null,
      });
    });

    const stored = await db.animales.get(cria.client_id);
    expect(stored.madre_id).toBe(madreAtipica.client_id);
    expect(stored.padre_id).toBeNull();

    const ops = await db.outbox.toArray();
    expect(ops.find((o) => o.client_id === cria.client_id)).toMatchObject({ status: 'pending' });
  });

  // ── 6. softDelete ────────────────────────────────────────────────────────
  it('softDeleteAnimal: setea deleted_at, sale de la vista activa y encola delete', async () => {
    const { result } = renderHook(() => useAnimalMutations(db));

    let animal;
    await act(async () => {
      animal = await result.current.createAnimal({ arete_local: '7', categoria: 'vaca', sexo: 'hembra' });
    });
    await db.outbox.clear();

    await act(async () => {
      await result.current.softDeleteAnimal(animal.client_id);
    });

    const stored = await db.animales.get(animal.client_id);
    expect(stored.deleted_at).toBeTruthy();

    const activos = await db.animales.filter((a) => a.deleted_at == null).toArray();
    expect(activos.find((a) => a.client_id === animal.client_id)).toBeUndefined();

    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: 'animales', op: 'delete', client_id: animal.client_id });
  });
});
