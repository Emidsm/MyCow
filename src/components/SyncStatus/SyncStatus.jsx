import { useSyncStatus } from '../../hooks/useSyncStatus.js';
import './SyncStatus.css';

function formatLastPullAt(iso) {
  if (!iso) return 'Sin sincronizar aún';
  return `Última sync: ${new Date(iso).toLocaleTimeString()}`;
}

/**
 * Indicador de sync: conexión, pendientes en outbox, spinner mientras
 * sincroniza y botón de sync manual. El disparo automático al recuperar
 * conexión vive en SyncProvider; este componente sólo REFLEJA el estado.
 */
export function SyncStatus() {
  const { isOnline, pendingCount, isSyncing, lastPullAt, syncNow } = useSyncStatus();

  return (
    <div className="sync-status" data-online={isOnline}>
      <span
        className={`sync-status__dot ${isOnline ? 'sync-status__dot--online' : 'sync-status__dot--offline'}`}
        aria-hidden="true"
      />
      <span className="sync-status__label">{isOnline ? 'En línea' : 'Sin conexión'}</span>

      {pendingCount > 0 && (
        <span className="sync-status__pending">{pendingCount} pendientes</span>
      )}

      <span className="sync-status__last-pull">{formatLastPullAt(lastPullAt)}</span>

      <button
        type="button"
        className="sync-status__button"
        onClick={syncNow}
        disabled={!isOnline || isSyncing}
      >
        {isSyncing ? (
          <>
            <span className="sync-status__spinner" aria-hidden="true" />
            Sincronizando…
          </>
        ) : (
          'Sincronizar'
        )}
      </button>
    </div>
  );
}
