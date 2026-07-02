import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../sync/db.js';

/**
 * Nº de operaciones del outbox aún no confirmadas (pending, failed, o
 * waiting_ref). 'waiting_ref' = esperando a que una referencia (madre_id,
 * etc.) sincronice; NO es un fallo (ver engine.js UnresolvedReferenceError),
 * así que cuenta como pendiente normal, no como alarma. Reactivo vía
 * useLiveQuery: Dexie re-ejecuta la consulta sola cuando el store `outbox`
 * cambia (encolado nuevo, push exitoso que borra filas, un fallo que marca
 * 'failed', o una espera que marca 'waiting_ref'). Sin polling.
 *
 * `db` es inyectable para tests con una base Dexie aislada (fake-indexeddb).
 */
export function usePendingCount(db = defaultDb) {
  const count = useLiveQuery(
    () => db.outbox.where('status').anyOf('pending', 'failed', 'waiting_ref').count(),
    [db]
  );
  return count ?? 0;
}
