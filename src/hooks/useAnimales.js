import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../sync/db.js';

/**
 * Lista reactiva de animales activos (deleted_at IS NULL), con el nombre del
 * potrero actual resuelto (potrero_actual_id -> potreros.client_id -> nombre).
 *
 * NOTA de arquitectura: localmente TODO se referencia por client_id (regla
 * innegociable, ver memoria sync-pk-client-id), aunque en el server
 * potrero_actual_id es una FK real a potreros.id (0002_tables.sql). El motor
 * de sync traduce client_id -> id justo antes de empujar cada op (ver
 * resolveForeignKeys en sync/engine.js); localmente el campo siempre guarda
 * el client_id del potrero seleccionado, por eso el lookup aquí es por
 * client_id y no por id.
 *
 * useLiveQuery re-corre sola cuando cambian los stores `animales` o
 * `potreros` (p.ej. tras un pull); sin refetch manual.
 *
 * `db` es inyectable para tests con una base Dexie aislada.
 */
export function useAnimales(db = defaultDb) {
  const data = useLiveQuery(async () => {
    const [animales, potreros] = await Promise.all([
      db.animales.filter((a) => a.deleted_at == null).toArray(),
      db.potreros.filter((p) => p.deleted_at == null).toArray(),
    ]);

    const nombreByPotreroId = new Map(potreros.map((p) => [p.client_id, p.nombre]));

    return animales
      .map((animal) => ({
        ...animal,
        potrero_nombre: animal.potrero_actual_id
          ? (nombreByPotreroId.get(animal.potrero_actual_id) ?? null)
          : null,
      }))
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  }, [db]);

  return { animales: data ?? [], isLoading: data === undefined };
}
