import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './AuthContext.js';
import { supabase as defaultSupabase } from '../../lib/supabaseClient.js';

/**
 * Gate de sesión de toda la app (ver App.jsx: sin `session` se muestra
 * LoginScreen y NI SIQUIERA se monta <SyncProvider>, así que el scheduler
 * de auto-sync no arranca sin credenciales).
 *
 * OFFLINE CRÍTICO — por qué esto basta para "abrir la app offline sin
 * re-pedir login":
 *   `supabase.auth.getSession()` lee la sesión de `storage` (ver
 *   supabaseClient.js: persistSession + storage=localStorage) SIN hacer una
 *   llamada de red obligatoria. Si hay una sesión guardada y aún no vencida,
 *   `loading` pasa a `false` con esa sesión ya puesta — la app entra directo,
 *   sin bloquear esperando contactar al servidor. `autoRefreshToken` (mismo
 *   archivo) intenta refrescar el access token en segundo plano; si falla
 *   por falta de red simplemente reintenta más tarde y NO invalida la
 *   sesión ya restaurada. El motor de sync (SyncProvider/connectivity.js) ya
 *   maneja sus propios reintentos cuando la red vuelve.
 *
 * `supabase` es inyectable (tests pasan un mock con `auth.getSession`,
 * `auth.onAuthStateChange`, `auth.signInWithPassword`, `auth.signOut`) sin
 * arrastrar el cliente real ni el fail-fast de env vars. Mismo patrón de DI
 * que SyncProvider.
 */
export function AuthProvider({ children, supabase = defaultSupabase }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data?.session ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      listener?.subscription?.unsubscribe();
    };
  }, [supabase]);

  const signIn = useCallback(
    async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    [supabase]
  );

  // signOut: SÓLO limpia el token de sesión (storage local vía
  // supabase-js). Deliberadamente NO toca IndexedDB/Dexie (outbox ni datos
  // ya sincronizados): en el modelo "rancho único compartido" esos datos no
  // son "propiedad" de la sesión que cierra, son del rancho. Borrarlos:
  //   (a) obligaría a re-descargar todo el histórico en el siguiente login, y
  //   (b) perdería silenciosamente cualquier operación del outbox que aún
  //       no haya subido (p.ej. el usuario cierra sesión sin darse cuenta de
  //       que sigue offline con cambios sin sincronizar).
  // Ver README (Auth) y AnimalForm/writes.js para el resto del ciclo de vida
  // del outbox.
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, loading, signIn, signOut }),
    [session, loading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
