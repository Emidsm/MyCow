import { useMemo } from 'react';
import { writesFor } from '../../sync/writes.js';
import { db as defaultDb } from '../../sync/db.js';

/**
 * Envuelve los writes atómicos del motor de sync (writesFor(db).*) con la
 * lógica de negocio del alta/edición de animales. NO reimplementa el motor:
 * cada método delega en create/update/softDelete ya probados (10/10);
 * sólo añade encima:
 *
 *   - CHECK local semental=>macho (replica chk_semental_es_macho de
 *     0002_tables.sql) ANTES de escribir, para no ensuciar el outbox con un
 *     insert/update que el server rechazaría igual.
 *   - Ascenso de categoría: si `updateAnimal` cambia `categoria`, encola
 *     ADEMÁS un insert en historial_categoria con animal_id=client_id del
 *     animal. El orden causal del outbox (autoincrement, ver db.js) garantiza
 *     que el update del animal se drena antes que el insert del historial.
 *     Si `categoria` no cambia, no se toca historial_categoria.
 *
 * `animal_id` en historial_categoria y `madre_id`/`padre_id`/
 * `potrero_actual_id` en animales guardan el client_id local del registro
 * referenciado (regla innegociable: todo por client_id). El motor de sync
 * traduce esos client_id al id real de Postgres justo antes de empujar cada
 * op (ver resolveForeignKeys en sync/engine.js); si el referenciado aún no
 * sincronizó, la op queda 'failed' con retry y se resuelve sola cuando
 * sincronice — nunca bloquea el guardado local.
 */
export function useAnimalMutations(db = defaultDb) {
  return useMemo(() => {
    const writes = writesFor(db);

    function assertSementalEsMacho({ categoria, sexo }) {
      if (categoria === 'semental' && sexo !== 'macho') {
        throw new Error('Un semental debe ser macho.');
      }
    }

    async function createAnimal(data) {
      assertSementalEsMacho(data);
      return writes.animales.create(data);
    }

    async function updateAnimal(clientId, changes) {
      const existing = await db.animales.get(clientId);
      if (!existing) {
        throw new Error(`updateAnimal: no existe animal client_id=${clientId}`);
      }

      assertSementalEsMacho({ ...existing, ...changes });

      const updated = await writes.animales.update(clientId, changes);

      const categoriaAscendio =
        'categoria' in changes && changes.categoria !== existing.categoria;
      if (categoriaAscendio) {
        await writes.historial_categoria.create({
          animal_id: clientId,
          categoria_anterior: existing.categoria,
          categoria_nueva: changes.categoria,
          fecha: new Date().toISOString(),
        });
      }

      return updated;
    }

    async function softDeleteAnimal(clientId) {
      return writes.animales.softDelete(clientId);
    }

    return { createAnimal, updateAnimal, softDeleteAnimal };
  }, [db]);
}
