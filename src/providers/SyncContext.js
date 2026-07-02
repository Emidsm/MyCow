import { createContext, useContext } from 'react';

/**
 * Contexto puro (sin dependencia de src/sync/index.js ni de Supabase) para
 * que los tests puedan inyectar un valor mock sin arrastrar el fail-fast de
 * variables de entorno del cliente Supabase real. SyncProvider.jsx es quien
 * ata el valor real; este módulo sólo define la forma del contrato.
 */
export const SyncContext = createContext(null);

export function useSyncContext() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSyncContext debe usarse dentro de <SyncProvider>');
  }
  return ctx;
}
