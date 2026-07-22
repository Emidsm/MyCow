import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMovimientos } from './useMovimientos.js';
import { db as defaultDb } from '../../sync/db.js';
import { formatDate } from '../../utils.js';
import './MovimientoHistorial.css';

/**
 * Historial de movimientos de un animal, más reciente primero. NULL de
 * origen se muestra como "Alta" (primer movimiento del animal).
 */
export function MovimientoHistorial({ db = defaultDb, animalClientId }) {
  const { movimientos, isLoading } = useMovimientos(animalClientId, db);

  if (isLoading) {
    return <p className="movimiento-historial__status">Cargando movimientos…</p>;
  }
  if (movimientos.length === 0) {
    return <p className="movimiento-historial__status">Sin movimientos registrados.</p>;
  }

  return (
    <ul className="movimiento-historial">
      {movimientos.map((m) => (
        <li key={m.client_id} className="movimiento-historial__row">
          <span className="movimiento-historial__fecha">{formatDate(m.fecha)}</span>
          <span className="movimiento-historial__ruta">
            {m.potrero_origen_nombre ?? 'Alta'} → {m.potrero_destino_nombre}
          </span>
          {m.detalle && (
            <span className="movimiento-historial__detalle">{m.detalle}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
