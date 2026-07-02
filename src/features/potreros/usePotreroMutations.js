import { useMemo } from 'react';
import { writesFor } from '../../sync/writes.js';
import { db as defaultDb } from '../../sync/db.js';

export function usePotreroMutations(db = defaultDb) {
  return useMemo(() => {
    const writes = writesFor(db);

    async function createPotrero(data) {
      if (!data.nombre || !data.nombre.trim()) {
        throw new Error('El nombre del potrero es obligatorio.');
      }
      return writes.potreros.create({ nombre: data.nombre.trim(), activo: true });
    }

    async function updatePotrero(clientId, changes) {
      const existing = await db.potreros.get(clientId);
      if (!existing) {
        throw new Error(`updatePotrero: no existe potrero client_id=${clientId}`);
      }
      if ('nombre' in changes && (!changes.nombre || !changes.nombre.trim())) {
        throw new Error('El nombre del potrero es obligatorio.');
      }
      return writes.potreros.update(clientId, changes);
    }

    async function deletePotrero(clientId) {
      return writes.potreros.softDelete(clientId);
    }

    return { createPotrero, updatePotrero, deletePotrero };
  }, [db]);
}
