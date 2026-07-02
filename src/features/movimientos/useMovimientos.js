import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../../sync/db.js';

/**
 * Historial reactivo de movimientos de UN animal (deleted_at IS NULL), con
 * los nombres de potrero origen/destino resueltos (client_id -> nombre;
 * mismo patrón que useAnimales para potrero_actual_id).
 *
 * Orden: fecha DESC y, como desempate, created_at DESC — igual que
 * v_potrero_actual (0005_views.sql), para que el último de la lista
 * coincida con el potrero actual derivado.
 */
export function useMovimientos(animalClientId, db = defaultDb) {
  const data = useLiveQuery(async () => {
    if (!animalClientId) return [];

    const [movimientos, potreros] = await Promise.all([
      db.movimientos
        .where('animal_id')
        .equals(animalClientId)
        .filter((m) => m.deleted_at == null)
        .toArray(),
      db.potreros.filter((p) => p.deleted_at == null).toArray(),
    ]);

    const nombreByPotreroId = new Map(potreros.map((p) => [p.client_id, p.nombre]));

    return movimientos
      .map((m) => ({
        ...m,
        potrero_origen_nombre: m.potrero_origen_id
          ? (nombreByPotreroId.get(m.potrero_origen_id) ?? null)
          : null,
        potrero_destino_nombre: nombreByPotreroId.get(m.potrero_destino_id) ?? null,
      }))
      .sort((a, b) => {
        const fechaCmp = (b.fecha ?? '').localeCompare(a.fecha ?? '');
        if (fechaCmp !== 0) return fechaCmp;
        return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      });
  }, [db, animalClientId]);

  return { movimientos: data ?? [], isLoading: data === undefined };
}
