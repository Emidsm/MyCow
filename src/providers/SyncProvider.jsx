import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SyncContext } from './SyncContext.js';
import { usePendingCount } from '../hooks/usePendingCount.js';
import { db as defaultDb, engine as defaultEngine, connectivity as defaultConnectivity } from '../sync/index.js';

/**
 * Ata el motor de sync (headless) a React:
 *   - arranca/detiene el scheduler de auto-sync (engine.start/stop) al
 *     montar/desmontar,
 *   - se suscribe al emitter de connectivity.js para reflejar online/offline
 *     y, al RECUPERAR conexión, dispara un sync inmediato (no esperar al
 *     próximo tick del scheduler) — este es el ÚNICO lugar que dispara esa
 *     lógica; SyncStatus sólo la refleja,
 *   - se suscribe a engine.onSyncStateChange para que isSyncing/lastPullAt
 *     reflejen TODO ciclo (manual o del scheduler en segundo plano).
 *
 * db/engine/connectivity son inyectables (tests pueden pasar instancias
 * aisladas); por defecto usan los singletons reales de src/sync/index.js.
 */
export function SyncProvider({
  children,
  db = defaultDb,
  engine = defaultEngine,
  connectivity = defaultConnectivity,
}) {
  const [isOnline, setIsOnline] = useState(connectivity.online);
  const [isSyncing, setIsSyncing] = useState(engine.isRunning());
  const [lastPullAt, setLastPullAt] = useState(null);
  const pendingCount = usePendingCount(db);

  // Evita disparar un sync en la primera suscripción a connectivity (que
  // llama al listener de inmediato con el estado actual): sólo queremos
  // reaccionar a una transición real offline -> online.
  const isFirstOnlineNotification = useRef(true);

  const syncNow = useCallback(async () => {
    try {
      await engine.sync();
    } catch {
      // Fallo de red/servidor: cada op ya quedó marcada 'failed' en el
      // outbox (ver engine.push) y se reintentará con backoff; no hay nada
      // más que hacer aquí salvo no dejar una promesa rechazada suelta.
    }
  }, [engine]);

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);

  useEffect(
    () =>
      engine.onSyncStateChange((running, result) => {
        setIsSyncing(running);
        if (!running && result && !result.skipped) {
          setLastPullAt(new Date().toISOString());
        }
      }),
    [engine]
  );

  useEffect(
    () =>
      connectivity.subscribe((online) => {
        setIsOnline(online);
        if (online) {
          if (isFirstOnlineNotification.current) {
            isFirstOnlineNotification.current = false;
          } else {
            syncNow();
          }
        }
      }),
    [connectivity, syncNow]
  );

  const value = useMemo(
    () => ({ isOnline, pendingCount, isSyncing, lastPullAt, syncNow }),
    [isOnline, pendingCount, isSyncing, lastPullAt, syncNow]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
