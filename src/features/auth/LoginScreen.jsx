import { useState } from 'react';
import { useAuth } from './useAuth.js';
import './LoginScreen.css';

// Traduce el error de signIn a un mensaje accionable. Se distingue
// "sin conexión" de "credenciales inválidas" porque requieren reacciones
// distintas del usuario (esperar señal vs. corregir datos) — con el mensaje
// genérico de supabase-js ambos casos se ven idénticos.
function friendlyError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Sin conexión a internet. Necesitas señal para iniciar sesión la primera vez.';
  }
  const message = err?.message ?? '';
  if (/invalid login credentials/i.test(message)) {
    return 'Correo o contraseña incorrectos.';
  }
  if (/fetch|network/i.test(message)) {
    return 'No se pudo contactar al servidor. Verifica tu conexión e intenta de nuevo.';
  }
  return message || 'No se pudo iniciar sesión.';
}

/**
 * Login por email+contraseña únicamente (supabase.auth.signInWithPassword).
 * SIN registro abierto: las cuentas de este rancho (dueño + pocos
 * trabajadores) se dan de alta a mano desde el Dashboard de Supabase — más
 * simple y más seguro que exponer signUp público para un puñado de usuarios
 * conocidos. Ver README para el procedimiento de alta.
 *
 * Sin <form> nativo (evita el submit/reload por defecto): el envío es un
 * handler controlado en el botón, con Enter en los inputs como atajo.
 */
export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (!email.trim() || !password) {
      setError('Ingresa correo y contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit();
  }

  return (
    <div className="login-screen">
      <div className="login-screen__card">
        <h1 className="login-screen__title">MyCow</h1>
        <p className="login-screen__subtitle">Inicia sesión para gestionar el rancho.</p>

        <label className="login-screen__field">
          <span>Correo</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
          />
        </label>

        <label className="login-screen__field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
          />
        </label>

        {error && (
          <p className="login-screen__error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="login-screen__submit"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Ingresando…' : 'Iniciar sesión'}
        </button>

        <p className="login-screen__hint">
          ¿No tienes cuenta? Pide al encargado del rancho que te dé de alta desde el panel de
          Supabase.
        </p>
      </div>
    </div>
  );
}
