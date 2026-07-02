/**
 * API pública del motor de sync (headless).
 *
 * Este es el facade ergonómico para la app (2B). Ata las dependencias reales:
 * la base Dexie singleton (db.js) y el cliente Supabase real (supabaseClient).
 *
 * Nota: importar `supabaseClient` dispara el fail-fast de variables de entorno.
 * Por eso los TESTS NO importan este index: importan db.js/writes.js/engine.js
 * directamente e inyectan un mock de Supabase y una base Dexie aislada.
 */

import { supabase } from '../lib/supabaseClient.js';
import { db } from './db.js';
import { createEngine, resolveConflict } from './engine.js';
import { writesFor } from './writes.js';
import { createConnectivity } from './connectivity.js';
import { syncConfig } from './config.js';

// Escrituras locales atómicas por entidad, ligadas a la base singleton.
export const writes = writesFor(db);

// Motor listo para usar (push/pull/sync/start/stop).
export const engine = createEngine({ db, supabase, config: syncConfig });

// Conectividad. Ping ligero contra Supabase para detectar "wifi sin internet":
// una consulta baratísima (HEAD count) que falla si no hay salida real.
export const connectivity = createConnectivity({
  pingFn: async () => {
    const { error } = await supabase
      .from('potreros')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    if (error) throw error;
  },
});

// Reexports de bajo nivel para usos avanzados / tests dentro de la app.
export { db, createEngine, resolveConflict, writesFor, createConnectivity, syncConfig };
export { createDb, ENTITIES, ENTITY_STORES } from './db.js';
export { create, update, softDelete } from './writes.js';
export {
  SYNC_DB_NAME,
  SYNC_INTERVAL_MS,
  SYNC_MAX_RETRIES,
  SYNC_BACKOFF_BASE_MS,
} from './config.js';
