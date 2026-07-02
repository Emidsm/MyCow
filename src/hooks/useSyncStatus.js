import { useSyncContext } from '../providers/SyncContext.js';

/**
 * Azúcar de lectura sobre SyncContext: { isOnline, pendingCount, isSyncing,
 * lastPullAt, syncNow }. Requiere estar bajo <SyncProvider>.
 */
export function useSyncStatus() {
  return useSyncContext();
}
