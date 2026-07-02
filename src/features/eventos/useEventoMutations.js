import { useMemo } from 'react';
import { create, update } from '../../sync/writes.js';
import { db as defaultDb } from '../../sync/db.js';

/**
 * registrarDefuncion / registrarVenta: alta de un evento terminal + espejo
 * optimista de animales.estado_vida, en UNA sola transacción Dexie (mismo
 * patrón que registrarMovimiento en features/movimientos).
 *
 * La fuente de verdad de estado_vida es el trigger del server
 * (fn_defuncion_marca_muerto / fn_venta_marca_vendido, ver 0004_triggers).
 * El espejo local sólo da feedback inmediato offline; el próximo pull
 * reconcilia si algo diverge.
 *
 * UNIQUE animal_id en defunciones (0002_tables.sql) rechazaría en el server
 * una segunda defunción para el mismo animal; se replica el CHECK en
 * cliente ANTES de encolar para no ensuciar el outbox con un rechazo
 * evitable (mismo criterio que chk_semental_es_macho en useAnimalMutations).
 */

function numberOrNull(value) {
  return value === '' || value == null ? null : Number(value);
}

function assertNoNegativos(fields) {
  for (const [label, value] of Object.entries(fields)) {
    if (value != null && value < 0) {
      throw new Error(`${label} no puede ser negativo.`);
    }
  }
}

export async function registrarDefuncion(db, { animal_id, fecha_muerte, causa } = {}) {
  if (!fecha_muerte) {
    throw new Error('La fecha de muerte es obligatoria.');
  }

  return db.transaction('rw', db.defunciones, db.animales, db.outbox, async () => {
    const animal = await db.animales.get(animal_id);
    if (!animal) {
      throw new Error(`registrarDefuncion: no existe animal client_id=${animal_id}`);
    }

    const existente = await db.defunciones
      .where('animal_id')
      .equals(animal_id)
      .filter((d) => d.deleted_at == null)
      .first();
    if (existente) {
      throw new Error('Este animal ya tiene una defunción registrada.');
    }

    const defuncion = await create(db, 'defunciones', {
      animal_id,
      fecha_muerte,
      causa: causa || null,
    });

    await update(db, 'animales', animal_id, { estado_vida: 'muerto' });

    return defuncion;
  });
}

export async function registrarVenta(
  db,
  { animal_id, fecha_venta, peso_kg, comprador, precio, moneda } = {}
) {
  if (!fecha_venta) {
    throw new Error('La fecha de venta es obligatoria.');
  }

  const pesoKg = numberOrNull(peso_kg);
  const precioNum = numberOrNull(precio);
  assertNoNegativos({ 'El peso': pesoKg, 'El precio': precioNum });

  return db.transaction('rw', db.ventas, db.animales, db.outbox, async () => {
    const animal = await db.animales.get(animal_id);
    if (!animal) {
      throw new Error(`registrarVenta: no existe animal client_id=${animal_id}`);
    }

    const venta = await create(db, 'ventas', {
      animal_id,
      fecha_venta,
      peso_kg: pesoKg,
      comprador: comprador || null,
      precio: precioNum,
      moneda: moneda || 'MXN',
    });

    await update(db, 'animales', animal_id, { estado_vida: 'vendido' });

    return venta;
  });
}

export function useEventoMutations(db = defaultDb) {
  return useMemo(
    () => ({
      registrarDefuncion: (data) => registrarDefuncion(db, data),
      registrarVenta: (data) => registrarVenta(db, data),
    }),
    [db]
  );
}
