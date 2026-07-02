import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { usePotreroMutations } from '../usePotreroMutations.js';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

describe('usePotreroMutations', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(async () => { await dropDb(db); });

  it('createPotrero: persiste local y encola 1 insert en outbox', async () => {
    const { result } = renderHook(() => usePotreroMutations(db));
    let created;
    await act(async () => {
      created = await result.current.createPotrero({ nombre: 'Pasto Verde' });
    });
    expect(created.client_id).toBeTruthy();
    expect(created.nombre).toBe('Pasto Verde');
    const stored = await db.potreros.get(created.client_id);
    expect(stored).toMatchObject({ nombre: 'Pasto Verde', activo: true });
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: 'potreros', op: 'insert', status: 'pending' });
  });

  it('createPotrero: bloquea nombre vacío', async () => {
    const { result } = renderHook(() => usePotreroMutations(db));
    await expect(
      act(async () => result.current.createPotrero({ nombre: '' }))
    ).rejects.toThrow(/nombre.*obligatorio/i);
    expect(await db.potreros.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('updatePotrero: modifica nombre y encola update', async () => {
    const { result } = renderHook(() => usePotreroMutations(db));
    let created;
    await act(async () => {
      created = await result.current.createPotrero({ nombre: 'Original' });
    });
    await db.outbox.clear();

    await act(async () => {
      await result.current.updatePotrero(created.client_id, { nombre: 'Renombrado' });
    });
    const stored = await db.potreros.get(created.client_id);
    expect(stored.nombre).toBe('Renombrado');
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: 'potreros', op: 'update', status: 'pending' });
  });

  it('updatePotrero: bloquea nombre vacío', async () => {
    const { result } = renderHook(() => usePotreroMutations(db));
    let created;
    await act(async () => {
      created = await result.current.createPotrero({ nombre: 'Test' });
    });
    await db.outbox.clear();

    await expect(
      act(async () => result.current.updatePotrero(created.client_id, { nombre: '  ' }))
    ).rejects.toThrow(/nombre.*obligatorio/i);
  });

  it('softDeletePotrero: setea deleted_at y encola delete', async () => {
    const { result } = renderHook(() => usePotreroMutations(db));
    let created;
    await act(async () => {
      created = await result.current.createPotrero({ nombre: 'Borrar' });
    });
    await db.outbox.clear();

    await act(async () => {
      await result.current.deletePotrero(created.client_id);
    });
    const stored = await db.potreros.get(created.client_id);
    expect(stored.deleted_at).toBeTruthy();
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: 'potreros', op: 'delete', status: 'pending' });
  });
});
