import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncStatus } from '../../hooks/useSyncStatus.js';
import { db as defaultDb } from '../../sync/db.js';
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

function itemLabel(item) {
  if (item.entity === 'animales' && item.payload?.arete_local) {
    return `Arete ${item.payload.arete_local}`;
  }
  if (item.entity === 'potreros' && item.payload?.nombre) {
    return item.payload.nombre;
  }
  return item.client_id?.slice(0, 8);
}

const ENTITY_ROUTE = {
  animales: '/animales',
  potreros: '/potreros',
  movimientos: '/animales',
  defunciones: '/animales',
  historial_categoria: '/animales',
  eventos_reproductivos: '/animales',
  fotos: '/animales',
  ventas: '/',
};

export function SyncStatus({ db = defaultDb } = {}) {
  const navigate = useNavigate();
  const { isOnline, pendingCount, isSyncing, lastPullAt, syncNow } = useSyncStatus();
  const [expanded, setExpanded] = useState(false);

  const pendingItems = useLiveQuery(
    () => db.outbox.where('status').anyOf('pending', 'failed', 'waiting_ref').toArray(),
    [db]
  );

  function handleItemClick(item) {
    setExpanded(false);
    navigate(ENTITY_ROUTE[item.entity] ?? '/');
  }

  const handleRetry = useCallback(async (item) => {
    await db.outbox.update(item.id, { status: 'pending', attempts: 0, last_error: null, next_retry_at: null });
  }, [db]);

  const handleRetryAll = useCallback(async () => {
    if (!pendingItems) return;
    for (const item of pendingItems) {
      if (item.status === 'failed') {
        await db.outbox.update(item.id, { status: 'pending', attempts: 0, last_error: null, next_retry_at: null });
      }
    }
  }, [db, pendingItems]);

  const failedCount = pendingItems?.filter((i) => i.status === 'failed').length ?? 0;

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
        <div className="sync-status__pending-list">
          {failedCount > 0 && (
            <button className="sync-status__retry-all" onClick={handleRetryAll}>
              Reintentar {failedCount} fallidas
            </button>
          )}
          <ul className="sync-status__pending-items">
            {pendingItems.map((item) => (
              <li key={item.id} className="sync-status__pending-item" data-status={item.status}>
                <button className="sync-status__item-main" onClick={() => handleItemClick(item)}>
                  <span className="sync-status__item-op">{opLabel(item.op)}</span>
                  <span className="sync-status__item-entity">{entityLabel(item.entity)}</span>
                  <span className="sync-status__item-label">{itemLabel(item)}</span>
                </button>
                <div className="sync-status__item-meta">
                  {item.status === 'failed' && item.last_error && (
                    <span className="sync-status__item-error" title={item.last_error}>
                      {item.last_error.length > 60 ? item.last_error.slice(0, 60) + '…' : item.last_error}
                    </span>
                  )}
                  {item.status === 'waiting_ref' && (
                    <span className="sync-status__item-waiting">esperando referencia</span>
                  )}
                  {item.status === 'pending' && (
                    <span className="sync-status__item-pending">pendiente</span>
                  )}
                  {item.status === 'failed' && (
                    <button
                      className="sync-status__retry-btn"
                      onClick={(e) => { e.stopPropagation(); handleRetry(item); }}
                      title="Reintentar"
                    >
                      ↻
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
