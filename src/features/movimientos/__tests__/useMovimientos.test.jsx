import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { randomUUID } from 'node:crypto';
import { createDb } from '../../../sync/db.js';
import { useMovimientos } from '../useMovimientos.js';

function freshDb() {
  return createDb(`test_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

// Reproduce el escenario del seed real: animal_300 con 2 movimientos el
// mismo día (Morones -> El Jagüey -> El Salto), desempatados por created_at.
describe('useMovimientos', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  it('animal_300: muestra sus 2 movimientos en orden (más reciente primero) y el potrero actual derivado = El Salto', async () => {
    await db.potreros.bulkPut([
      { client_id: 'morones', nombre: 'Morones', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null },
      { client_id: 'jaguey', nombre: 'El Jagüey', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null },
      { client_id: 'salto', nombre: 'El Salto', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null },
    ]);
    await db.animales.put({
      client_id: 'animal_300', arete_local: '300', categoria: 'novillo',
      potrero_actual_id: 'salto', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });
    await db.movimientos.bulkPut([
      {
        client_id: 'mov_1', animal_id: 'animal_300', potrero_origen_id: 'morones', potrero_destino_id: 'jaguey',
        fecha: '2025-09-07', created_at: '2025-09-07T08:00:00.000Z', updated_at: '2025-09-07T08:00:00.000Z', deleted_at: null,
      },
      {
        client_id: 'mov_2', animal_id: 'animal_300', potrero_origen_id: 'jaguey', potrero_destino_id: 'salto',
        fecha: '2025-09-07', created_at: '2025-09-07T09:00:00.000Z', updated_at: '2025-09-07T09:00:00.000Z', deleted_at: null,
      },
    ]);

    const { result } = renderHook(() => useMovimientos('animal_300', db));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.movimientos).toHaveLength(2);

    // Más reciente primero: mov_2 (Jagüey -> Salto) antes que mov_1.
    expect(result.current.movimientos[0]).toMatchObject({
      client_id: 'mov_2', potrero_origen_nombre: 'El Jagüey', potrero_destino_nombre: 'El Salto',
    });
    expect(result.current.movimientos[1]).toMatchObject({
      client_id: 'mov_1', potrero_origen_nombre: 'Morones', potrero_destino_nombre: 'El Jagüey',
    });

    // Potrero actual derivado (cache local, espejo de v_potrero_actual): El Salto.
    const animal = await db.animales.get('animal_300');
    const potreroActual = await db.potreros.get(animal.potrero_actual_id);
    expect(potreroActual.nombre).toBe('El Salto');
  });

  it('primer movimiento (alta): origen NULL se resuelve a potrero_origen_nombre = null', async () => {
    await db.potreros.put({ client_id: 'p1', nombre: 'Sierra', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null });
    await db.animales.put({ client_id: 'a1', arete_local: '1', categoria: 'cria', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null });
    await db.movimientos.put({
      client_id: 'mov_alta', animal_id: 'a1', potrero_origen_id: null, potrero_destino_id: 'p1',
      fecha: '2026-01-01', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    });

    const { result } = renderHook(() => useMovimientos('a1', db));

    await waitFor(() => expect(result.current.movimientos).toHaveLength(1));
    expect(result.current.movimientos[0]).toMatchObject({
      potrero_origen_nombre: null, potrero_destino_nombre: 'Sierra',
    });
  });

  it('filtra movimientos soft-borrados', async () => {
    await db.potreros.put({ client_id: 'p1', nombre: 'Sierra', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null });
    await db.animales.put({ client_id: 'a1', arete_local: '1', categoria: 'cria', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null });
    await db.movimientos.put({
      client_id: 'mov_borrado', animal_id: 'a1', potrero_origen_id: null, potrero_destino_id: 'p1',
      fecha: '2026-01-01', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: '2026-01-02T00:00:00.000Z',
    });

    const { result } = renderHook(() => useMovimientos('a1', db));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.movimientos).toHaveLength(0);
  });
});
