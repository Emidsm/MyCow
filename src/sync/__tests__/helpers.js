import { randomUUID } from 'node:crypto';
import { createDb, ENTITIES } from '../db.js';

/**
 * Utilidades compartidas por los tests. Sin red real: la única "nube" es el
 * mock de Supabase en memoria de abajo.
 */

// Crea una base Dexie aislada con nombre único por test (evita colisiones
// entre tests que corren sobre el mismo fake-indexeddb global).
export function freshDb() {
  return createDb(`test_${randomUUID()}`);
}

export async function dropDb(db) {
  db.close();
  await db.delete();
}

/**
 * Mock de cliente Supabase con almacenamiento en memoria.
 * Implementa exactamente lo que usa el engine:
 *   - from(entity).upsert(payload, { onConflict: 'client_id' })
 *   - from(entity).select('*').gt('updated_at', since).order(...)  (thenable)
 *
 * Extras de test:
 *   - _tables: acceso directo a las filas por entidad.
 *   - seed(entity, rows): precarga filas remotas.
 *   - failUpsertOnce(msg): la próxima upsert devuelve { error } una sola vez.
 *   - upsertCalls: contador para asegurar idempotencia.
 *
 * Emula el server: en upsert INSERT (client_id nuevo) asigna un `id` si falta
 * (como gen_random_uuid). NO re-sella updated_at (el engine no depende de ello
 * para los escenarios probados; el cliente envía su propio updated_at).
 */
export function createMockSupabase(initial = {}) {
  const tables = {};
  for (const e of ENTITIES) tables[e] = [...(initial[e] ?? [])];

  let failMsg = null;
  const state = { upsertCalls: 0 };

  function from(entity) {
    return {
      async upsert(payload, _opts) {
        state.upsertCalls++;
        if (failMsg) {
          const msg = failMsg;
          failMsg = null;
          return { data: null, error: { message: msg } };
        }
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          const arr = tables[entity];
          // onConflict: 'client_id' — dedupe/idempotencia por client_id.
          const idx = arr.findIndex((r) => r.client_id === row.client_id);
          if (idx >= 0) {
            arr[idx] = { ...arr[idx], ...row };
          } else {
            arr.push({ id: row.id ?? randomUUID(), ...row });
          }
        }
        return { data: null, error: null };
      },

      select(_cols, _opts) {
        // Query builder thenable: soporta .gt().order() y await.
        const filters = { gtCol: null, gtVal: null };
        const builder = {
          gt(col, val) { filters.gtCol = col; filters.gtVal = val; return builder; },
          order() { return builder; },
          limit() { return builder; },
          then(resolve) {
            let rows = [...tables[entity]];
            if (filters.gtCol != null) {
              const g = new Date(filters.gtVal).getTime();
              rows = rows.filter((r) => new Date(r[filters.gtCol]).getTime() > g);
            }
            rows.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          },
        };
        return builder;
      },
    };
  }

  return {
    from,
    _tables: tables,
    get upsertCalls() { return state.upsertCalls; },
    seed(entity, rows) { tables[entity].push(...rows); },
    failUpsertOnce(msg = 'network error') { failMsg = msg; },
  };
}
