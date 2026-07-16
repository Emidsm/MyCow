import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase único para toda la app.
 *
 * REGLA INNEGOCIABLE: toda la configuración proviene de variables de
 * entorno (import.meta.env, inyectadas por Vite desde `.env`).
 * Si falta alguna variable requerida, la app falla al arrancar
 * (fail-fast) con un error explícito en lugar de fallar silenciosamente
 * en tiempo de ejecución.
 */

const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_APP_NAME',
  'VITE_APP_TAGLINE',
];

const missing = REQUIRED_ENV_VARS.filter((name) => {
  const value = import.meta.env[name];
  return value === undefined || value === null || String(value).trim() === '';
});

if (missing.length > 0) {
  throw new Error(
    `[GestionGanadera] Faltan variables de entorno requeridas: ${missing.join(', ')}. ` +
      'Copia .env.example a .env y define todos los valores.'
  );
}

export const APP_NAME = import.meta.env.VITE_APP_NAME;
export const APP_TAGLINE = import.meta.env.VITE_APP_TAGLINE;

/**
 * Persistencia de sesión — CRÍTICO para el uso offline de la app:
 * el usuario hace login UNA vez con señal, y luego debe poder abrir la
 * app y trabajar días sin conexión sin que se le vuelva a pedir
 * credenciales.
 *
 *   - persistSession: true   → la sesión (access+refresh token) se
 *     guarda en `storage` y sobrevive a cerrar/reabrir la app.
 *   - storage: localStorage  → explícito aunque coincide con el default
 *     de supabase-js en browser, para que quede documentado y no
 *     dependa de un default que podría cambiar entre versiones.
 *   - autoRefreshToken: true → refresca el access token en segundo
 *     plano antes de que expire. Si no hay red, el intento de refresh
 *     falla en silencio y se reintenta más tarde; la sesión guardada
 *     sigue siendo válida hasta su expiración real, así que abrir la
 *     app offline con una sesión no vencida entra directo (ver
 *     AuthProvider: getSession() lee de storage, no requiere red).
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Guarda: en Node (tests que sí lleguen a importar este módulo, fuera
      // de src/sync) no existe `window`; se deja que supabase-js use su
      // storage por defecto en vez de reventar en el import.
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
);
