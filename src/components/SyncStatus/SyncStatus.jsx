import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncStatus } from '../../hooks/useSyncStatus.js';
import { db as defaultDb } from '../../sync/db.js';
import { capitalize } from '../../utils.js';
import './SyncStatus.css';

function formatLastPullAt(iso) {
  if (!iso) return 'Sin sincronizar aún';
  return `Última sync: ${new Date(iso).toLocaleTimeString()}`;
}

function entityLabel(e) {
  return { animales: 'Animal', potreros: 'Potrero', movimientos: 'Movimiento', defunciones: 'Defunción', historial_categoria: 'Ascenso', eventos_reproductivos: 'Evento reprod.', ventas: 'Venta', fotos: 'Foto' }[e] ?? e;
}

function opLabel(o) {
  return { insert: 'Crear', update: 'Editar', delete: 'Retirar' }[o] ?? o;
}

export function SyncStatus({ db = defaultDb } = {}) {
  const { isOnline, pendingCount, isSyncing, lastPullAt, syncNow } = useSyncStatus();
  const [expanded, setExpanded] = useState(false);

  const pendingItems = useLiveQuery(
    () => db.outbox.where('status').anyOf('pending', 'failed', 'waiting_ref').toArray(),
    [db]
  );

  return (
    <div className="sync-status" data-online={isOnline}>
      <span
        className={`sync-status__dot ${isOnline ? 'sync-status__dot--online' : 'sync-status__dot--offline'}`}
        aria-hidden="true"
      />
      <span className="sync-status__label">{isOnline ? 'En línea' : 'Sin conexión'}</span>

      {pendingCount > 0 ? (
        <button className="sync-status__pending-btn" onClick={() => setExpanded(!expanded)}>
          {pendingCount} por sincronizar
          <span className={`sync-status__arrow ${expanded ? 'sync-status__arrow--open' : ''}`}>▸</span>
        </button>
      ) : (
        <span className="sync-status__synced">Sincronizado</span>
      )}

      {expanded && pendingItems && pendingItems.length > 0 && (
        <ul className="sync-status__pending-list">
          {pendingItems.map((item) => (
            <li key={item.id} className="sync-status__pending-item" data-status={item.status}>
              <span className="sync-status__item-op">{opLabel(item.op)}</span>
              <span className="sync-status__item-entity">{entityLabel(item.entity)}</span>
              <span className="sync-status__item-id">{item.client_id?.slice(0, 8)}</span>
              {item.status === 'failed' && item.last_error && (
                <span className="sync-status__item-error" title={item.last_error}>
                  {item.last_error.length > 50 ? item.last_error.slice(0, 50) + '…' : item.last_error}
                </span>
              )}
              {item.status === 'waiting_ref' && (
                <span className="sync-status__item-waiting">esperando referencia</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
