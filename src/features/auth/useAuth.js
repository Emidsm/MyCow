import { useAuthContext } from './AuthContext.js';

/**
 * Azúcar de lectura sobre AuthContext: { session, user, loading, signIn,
 * signOut }. Requiere estar bajo <AuthProvider>.
 */
export function useAuth() {
  return useAuthContext();
}
