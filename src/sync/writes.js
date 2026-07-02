import { v4 as uuidv4 } from 'uuid';
import { ENTITIES } from './db.js';

/**
 * Capa de escritura local (offline-first).
 *
 * INVARIANTE INNEGOCIABLE: cada mutación hace DOS cosas en UNA transacción
 * Dexie atómica ('rw' sobre el store de la entidad + outbox):
 *   a) escribe/actualiza el registro en su store local, y
 *   b) encola la operación equivalente en el outbox.
 * O entran las dos, o no entra ninguna. Si el encolado falla, la transacción
 * revierte y el registro tampoco queda (evita divergencia local↔outbox).
 *
 * El outbox es la ÚNICA fuente de operaciones salientes: ningún write toca
 * Supabase directo. El engine drena el outbox después (push).
 */

function nowIso() {
  return new Date().toISOString();
}

// Construye una fila de outbox coherente. `payload` es el SNAPSHOT COMPLETO
// del registro (no un diff): el upsert por client_id necesita la fila entera
// para poder INSERTARla la primera vez, y reaplicarla es idempotente.
function outboxRow(entity, op, clientId, payload, ts) {
  return {
    entity,
    op, // 'insert' | 'update' | 'delete'
    client_id: clientId,
    payload,
    created_at: ts,
    attempts: 0,
    last_error: null,
    status: 'pending',
    next_retry_at: null, // se fija sólo al fallar (backoff); ver engine.push
  };
}

/**
 * create: alta local + encolado 'insert'.
 * Todo registro creado en cliente nace con:
 *   - client_id = uuidv4()  (identidad estable, PK local y clave de upsert)
 *   - created_at / updated_at = reloj del cliente (el server los re-sella,
 *     pero el cliente necesita su propio updated_at para el LWW del pull).
 * NO fijamos `id`: lo asigna Postgres (gen_random_uuid) y llega en el pull.
 */
export async function create(db, entity, data = {}) {
  const client_id = data.client_id ?? uuidv4();
  const ts = nowIso();
  const record = {
    ...data,
    client_id,
    created_at: data.created_at ?? ts,
    updated_at: ts,
    deleted_at: data.deleted_at ?? null,
  };

  await db.transaction('rw', db[entity], db.outbox, async () => {
    await db[entity].put(record);
    await db.outbox.add(outboxRow(entity, 'insert', client_id, record, ts));
  });

  return record;
}

/**
 * update: modificación local + encolado 'update'.
 * Refresca updated_at con el reloj del cliente (no espera al trigger del
 * server) para que el LWW tenga una marca temporal local con la que competir.
 */
export async function update(db, entity, clientId, changes = {}) {
  const ts = nowIso();
  let updated;

  await db.transaction('rw', db[entity], db.outbox, async () => {
    const existing = await db[entity].get(clientId);
    if (!existing) {
      throw new Error(`update: no existe ${entity} con client_id=${clientId}`);
    }
    updated = {
      ...existing,
      ...changes,
      client_id: clientId, // la identidad no se toca nunca
      updated_at: ts,
    };
    await db[entity].put(updated);
    await db.outbox.add(outboxRow(entity, 'update', clientId, updated, ts));
  });

  return updated;
}

/**
 * softDelete: NUNCA hard-delete. Setea deleted_at (y updated_at) y encola un
 * 'delete' que en el server se propaga como un update con deleted_at (soft).
 * La fila NO se borra ni local ni remotamente; la UI filtra deleted_at IS NULL.
 */
export async function softDelete(db, entity, clientId) {
  const ts = nowIso();
  let updated;

  await db.transaction('rw', db[entity], db.outbox, async () => {
    const existing = await db[entity].get(clientId);
    if (!existing) {
      throw new Error(`softDelete: no existe ${entity} con client_id=${clientId}`);
    }
    updated = {
      ...existing,
      deleted_at: ts,
      updated_at: ts,
      client_id: clientId,
    };
    await db[entity].put(updated);
    await db.outbox.add(outboxRow(entity, 'delete', clientId, updated, ts));
  });

  return updated;
}

/**
 * Azúcar por entidad: `writesFor(db).animales.create({...})`.
 * Genera los 3 métodos (create/update/softDelete) ligados a cada una de las
 * 8 entidades sin repetir código.
 */
export function writesFor(db) {
  const api = {};
  for (const entity of ENTITIES) {
    api[entity] = {
      create: (data) => create(db, entity, data),
      update: (clientId, changes) => update(db, entity, clientId, changes),
      softDelete: (clientId) => softDelete(db, entity, clientId),
    };
  }
  return api;
}
