import Dexie from 'dexie';
import { SYNC_DB_NAME } from './config.js';

/**
 * Esquema Dexie local: espeja las 8 tablas de Postgres + dos stores de
 * soporte que NO existen en el server (outbox y sync_meta).
 *
 * ─────────────────────────────────────────────────────────────────────
 * DECISIÓN DE CLAVE PRIMARIA (léase con atención):
 * La PK de cada store de dominio es `client_id`, NO `id`.
 *
 * ¿Por qué desviarse del "id (PK)" literal del enunciado?
 *   1. `client_id` es el ÚNICO identificador garantizado en el instante de
 *      creación offline: lo genera el dispositivo (uuidv4). El `id` de
 *      Postgres se asigna con gen_random_uuid() y sólo se conoce DESPUÉS de
 *      un pull. Usar `id` como PK haría imposible persistir un registro
 *      recién creado sin conexión.
 *   2. `client_id` es además la clave de conciliación y de upsert
 *      (onConflict:'client_id'). Que la identidad local y la del protocolo
 *      de sync sean LA MISMA evita el clásico problema de doble clave.
 *   3. El enunciado pide indexar "como mínimo" id/client_id/updated_at/
 *      deleted_at + FKs: `id` sigue indexado (búsqueda por id del server).
 *
 * Filas remotas con client_id NULL (posible en el server según el modelo:
 * "client_id nullable en server") se normalizan en el pull haciendo
 * client_id = id antes de guardar, para que la PK local nunca sea nula.
 * (ver engine.reconcile)
 * ─────────────────────────────────────────────────────────────────────
 */

// Definición central de entidades de dominio y sus índices Dexie.
// Formato de índice Dexie: el PRIMER campo es la PK; el resto son índices
// secundarios. Indexamos: client_id (PK), id, updated_at, deleted_at
// (para filtrar activos y ordenar por LWW) y las FKs que se consultan.
export const ENTITY_STORES = {
  potreros:              'client_id, id, updated_at, deleted_at',
  animales:              'client_id, id, updated_at, deleted_at, madre_id, padre_id, potrero_actual_id',
  historial_categoria:   'client_id, id, updated_at, deleted_at, animal_id',
  movimientos:           'client_id, id, updated_at, deleted_at, animal_id, potrero_origen_id, potrero_destino_id',
  eventos_reproductivos: 'client_id, id, updated_at, deleted_at, madre_id, padre_id, cria_id',
  defunciones:           'client_id, id, updated_at, deleted_at, animal_id',
  ventas:                'client_id, id, updated_at, deleted_at, animal_id',
  fotos:                 'client_id, id, updated_at, deleted_at, animal_id',
};

// Lista de nombres de entidad de dominio (orden estable para el pull).
export const ENTITIES = Object.keys(ENTITY_STORES);

// Stores de soporte que NO existen en Postgres.
const SUPPORT_STORES = {
  // outbox: cola de operaciones salientes. `++id` autoincrement local es la
  // PK y — clave — su orden monotónico == orden CAUSAL de encolado en el
  // dispositivo. Drenamos por este id para respetar el orden de operaciones
  // sin depender de created_at (que puede empatar al milisegundo).
  // Campos guardados por fila (ver writes.js):
  //   id, entity, op('insert'|'update'|'delete'), client_id, payload,
  //   created_at, attempts, last_error, status('pending'|'syncing'|'failed'),
  //   next_retry_at (timestamp ms para el backoff; extensión documentada).
  outbox: '++id, entity, status, client_id, created_at',

  // sync_meta: pares clave/valor de metadatos de sync (p.ej. watermarks
  // last_pull_at:<entidad>).
  sync_meta: 'key',

  // fotos_data: almacén local de imágenes en base64, NO sincronizado.
  // La clave es el client_id del registro `fotos` asociado.
  fotos_data: 'client_id',
};

const ALL_STORES = { ...ENTITY_STORES, ...SUPPORT_STORES };

/**
 * Factory de la base local. Se expone como factory (no sólo singleton) para
 * poder crear bases aisladas por test con fake-indexeddb sin colisiones.
 * Dexie abre la conexión de forma perezosa (en la primera operación), así
 * que construir la instancia aquí no requiere IndexedDB todavía.
 */
export function createDb(name = SYNC_DB_NAME) {
  const db = new Dexie(name);
  db.version(1).stores(ALL_STORES);
  return db;
}

// Singleton para uso de la app (2B). Los tests crean sus propias bases.
export const db = createDb();
