import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb } from '../../sync/db.js';

/**
 * Evento(s) terminal(es) de UN animal (defunción y/o venta), reactivo.
 * Ambos son 1:1 con el animal en la práctica (UNIQUE animal_id en
 * defunciones; un animal vendido no debería morir después ni viceversa,
 * pero leemos ambos por separado en vez de asumirlo, para no ocultar datos
 * inconsistentes que vengan de un pull).
 */
export function useEventos(animalClientId, db = defaultDb) {
  const data = useLiveQuery(async () => {
    if (!animalClientId) return { defuncion: null, venta: null };

    const [defuncion, venta] = await Promise.all([
      db.defunciones
        .where('animal_id')
        .equals(animalClientId)
        .filter((d) => d.deleted_at == null)
        .first(),
      db.ventas
        .where('animal_id')
        .equals(animalClientId)
        .filter((v) => v.deleted_at == null)
        .first(),
    ]);

    return { defuncion: defuncion ?? null, venta: venta ?? null };
  }, [db, animalClientId]);

  return data ?? { defuncion: null, venta: null };
}
