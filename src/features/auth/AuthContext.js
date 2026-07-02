import { createContext, useContext } from 'react';

/**
 * Contexto puro (sin dependencia de supabaseClient.js) para que los tests
 * puedan inyectar un valor mock sin arrastrar el fail-fast de variables de
 * entorno del cliente Supabase real. AuthProvider.jsx es quien ata el valor
 * real; este módulo sólo define la forma del contrato. Mismo patrón que
 * SyncContext.js.
 */
export const AuthContext = createContext(null);

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
