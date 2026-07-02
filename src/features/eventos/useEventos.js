import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../../sync/db.js';

/**
 * Defunción de UN animal, reactiva.
 */
export function useEventos(animalClientId, db = defaultDb) {
  const data = useLiveQuery(async () => {
    if (!animalClientId) return { defuncion: null };

    const defuncion = await db.defunciones
      .where('animal_id')
      .equals(animalClientId)
      .filter((d) => d.deleted_at == null)
      .first();

    return { defuncion: defuncion ?? null };
  }, [db, animalClientId]);

  return data ?? { defuncion: null };
}
