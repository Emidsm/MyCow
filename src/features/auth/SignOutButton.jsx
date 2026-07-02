import { useAuth } from './useAuth.js';
import './SignOutButton.css';

/**
 * Cierra sesión. El outbox y la DB local NO se borran (ver AuthProvider:
 * signOut sólo limpia el token) — al volver a iniciar sesión, cualquier
 * dato ya sincronizado sigue disponible y cualquier operación pendiente en
 * el outbox se sigue drenando en el próximo sync.
 */
export function SignOutButton() {
  const { signOut } = useAuth();

  return (
    <button type="button" className="sign-out-button" onClick={() => signOut()}>
      Cerrar sesión
    </button>
  );
}
