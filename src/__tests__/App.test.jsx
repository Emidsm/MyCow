import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { randomUUID } from 'node:crypto';
import { App } from '../App.jsx';
import { createDb } from '../sync/db.js';

/**
 * Cubre el gate de sesión completo (AuthProvider + SyncProvider montados a
 * través de App), inyectando supabase/db/engine/connectivity mock — sin
 * tocar el cliente Supabase real ni fake-indexeddb más allá de lo que ya
 * usa el resto de la suite. Réplica de freshDb/dropDb (src/sync/__tests__).
 */
function freshDb() {
  return createDb(`test_app_${randomUUID()}`);
}
async function dropDb(db) {
  db.close();
  await db.delete();
}

function createMockSupabaseAuth(initialSession = null) {
  let session = initialSession;
  let stateChangeCb = null;
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session } })),
      onAuthStateChange: vi.fn((cb) => {
        stateChangeCb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword: vi.fn(async ({ email, password }) => {
        if (email === 'user@rancho.com' && password === 'correcta') {
          session = { user: { id: 'u1', email }, access_token: 'tok' };
          stateChangeCb?.('SIGNED_IN', session);
          return { error: null };
        }
        return { error: { message: 'Invalid login credentials' } };
      }),
      signOut: vi.fn(async () => {
        session = null;
        stateChangeCb?.('SIGNED_OUT', null);
        return { error: null };
      }),
    },
  };
}

// engine/connectivity mínimos que satisfacen el contrato que SyncProvider
// consume (ver src/providers/SyncProvider.jsx): start/stop/isRunning/
// onSyncStateChange y connectivity.online/subscribe.
function createMockEngine() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: () => false,
    sync: vi.fn().mockResolvedValue({ skipped: false }),
    onSyncStateChange: vi.fn(() => () => {}),
  };
}

function createMockConnectivity() {
  return {
    online: true,
    subscribe: vi.fn((fn) => {
      fn(true);
      return () => {};
    }),
  };
}

describe('App — gate de sesión', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
  });
  afterEach(async () => {
    await dropDb(db);
  });

  function renderApp(props) {
    return render(
      <MemoryRouter initialEntries={['/animales']}>
        <App {...props} />
      </MemoryRouter>
    );
  }

  it('sin sesión: muestra Login y NO arranca el scheduler de sync', async () => {
    const supabase = createMockSupabaseAuth(null);
    const engine = createMockEngine();

    renderApp({ supabase, db, engine, connectivity: createMockConnectivity() });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
    );
    expect(engine.start).not.toHaveBeenCalled();
  });

  it('login exitoso: monta la app y arranca el sync', async () => {
    const supabase = createMockSupabaseAuth(null);
    const engine = createMockEngine();

    renderApp({ supabase, db, engine, connectivity: createMockConnectivity() });

    await waitFor(() => screen.getByLabelText('Correo'));
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'user@rancho.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'correcta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('heading', { name: 'Animales' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
  });

  it('sesión persistida restaurada offline: entra directo a la app sin bloquear en login', async () => {
    const session = { user: { id: 'u1', email: 'user@rancho.com' }, access_token: 'tok' };
    const supabase = createMockSupabaseAuth(session);
    const engine = createMockEngine();

    renderApp({ supabase, db, engine, connectivity: createMockConnectivity() });

    await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Animales' })).toBeInTheDocument();
  });

  it('signOut: vuelve a Login y NO borra el outbox/DB local (ops pendientes siguen ahí)', async () => {
    const session = { user: { id: 'u1', email: 'user@rancho.com' }, access_token: 'tok' };
    const supabase = createMockSupabaseAuth(session);
    const engine = createMockEngine();

    await db.outbox.add({
      entity: 'animales',
      op: 'insert',
      client_id: 'x',
      payload: {},
      created_at: '',
      attempts: 0,
      status: 'pending',
    });

    renderApp({ supabase, db, engine, connectivity: createMockConnectivity() });

    await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
    );
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);

    const pending = await db.outbox.count();
    expect(pending).toBe(1);
  });
});
