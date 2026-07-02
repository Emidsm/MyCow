import { AuthProvider } from './features/auth/AuthProvider.jsx';
import { useAuth } from './features/auth/useAuth.js';
import { LoginScreen } from './features/auth/LoginScreen.jsx';
import { SignOutButton } from './features/auth/SignOutButton.jsx';
import { SyncProvider } from './providers/SyncProvider.jsx';
import { SyncStatus } from './components/SyncStatus/SyncStatus.jsx';
import { AnimalesList } from './features/animales/AnimalesList.jsx';
import { ThemeToggle } from './theme/ThemeToggle.jsx';
import './App.css';

/**
 * Gate de sesión: sin `session` se muestra LoginScreen y <SyncProvider> NI
 * SIQUIERA se monta — así el scheduler de auto-sync (engine.start(), ver
 * SyncProvider) no arranca y no se toca la red sin credenciales. Con
 * `session` (incluida una restaurada del storage al abrir offline, ver
 * AuthProvider) se monta la app real y el motor de sync.
 *
 * db/engine/connectivity se re-exponen hacia SyncProvider sólo para que los
 * tests puedan inyectar instancias aisladas, igual que ya hacía
 * SyncProvider por su cuenta.
 */
function AppShell({ db, engine, connectivity }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="app__loading">Cargando…</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <SyncProvider db={db} engine={engine} connectivity={connectivity}>
      <div className="app">
        <div className="app__topbar">
          <ThemeToggle />
          <SignOutButton />
        </div>
        <SyncStatus />
        <AnimalesList db={db} />
      </div>
    </SyncProvider>
  );
}

export function App({ supabase, db, engine, connectivity }) {
  return (
    <AuthProvider supabase={supabase}>
      <AppShell db={db} engine={engine} connectivity={connectivity} />
    </AuthProvider>
  );
}
