import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../sync/db.js';
import { usePendingCount } from '../usePendingCount.js';

// Réplica de freshDb/dropDb (src/sync/__tests__/helpers.js) para no importar
// utilidades de un entorno 'node' desde tests que corren en 'jsdom'.
function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

describe('usePendingCount', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('refleja el conteo de status pending+failed+waiting_ref del outbox', async () => {
    const { result } = renderHook(() => usePendingCount(db));

    await waitFor(() => expect(result.current).toBe(0));

    await db.outbox.bulkAdd([
      { entity: 'animales', op: 'insert', client_id: 'a', payload: {}, created_at: '', attempts: 0, status: 'pending' },
      { entity: 'animales', op: 'update', client_id: 'b', payload: {}, created_at: '', attempts: 1, status: 'failed' },
      { entity: 'animales', op: 'update', client_id: 'c', payload: {}, created_at: '', attempts: 0, status: 'syncing' },
      { entity: 'animales', op: 'insert', client_id: 'd', payload: {}, created_at: '', attempts: 0, status: 'waiting_ref' },
    ]);

    // pending + failed + waiting_ref cuentan; syncing NO (op en pleno vuelo).
    // waiting_ref (esperando una referencia, ver engine.js) NO es un fallo:
    // cuenta como pendiente normal, no como alarma.
    await waitFor(() => expect(result.current).toBe(3));
  });

  it('reacciona cuando una op sale del outbox (push exitoso la borra)', async () => {
    const row = await db.outbox.add({
      entity: 'potreros', op: 'insert', client_id: 'x', payload: {}, created_at: '', attempts: 0, status: 'pending',
    });

    const { result } = renderHook(() => usePendingCount(db));
    await waitFor(() => expect(result.current).toBe(1));

    await db.outbox.delete(row);

    await waitFor(() => expect(result.current).toBe(0));
  });
});
