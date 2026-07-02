import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../AuthProvider.jsx';
import { useAuth } from '../useAuth.js';

// Mock de supabase.auth con almacenamiento en memoria: sólo lo que
// AuthProvider usa (getSession, onAuthStateChange, signInWithPassword,
// signOut). Mismo patrón de DI que createMockSupabase en src/sync/__tests__.
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

function Probe() {
  const { session, loading, signIn, signOut } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="session">{session ? session.user.email : 'none'}</span>
      <button onClick={() => signIn('user@rancho.com', 'correcta')}>signin-ok</button>
      <button
        onClick={() =>
          signIn('user@rancho.com', 'mala').catch((err) => {
            document.querySelector('[data-testid="err"]').textContent = err.message;
          })
        }
      >
        signin-bad
      </button>
      <button onClick={() => signOut()}>signout</button>
      <span data-testid="err" />
    </div>
  );
}

function renderWithProvider(supabase) {
  return render(
    <AuthProvider supabase={supabase}>
      <Probe />
    </AuthProvider>
  );
}

describe('AuthProvider', () => {
  it('sin sesión guardada: pasa a loading=false con session=none', async () => {
    const supabase = createMockSupabaseAuth(null);
    renderWithProvider(supabase);

    expect(screen.getByTestId('loading').textContent).toBe('true');
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('session').textContent).toBe('none');
  });

  it('restaura una sesión persistida (offline) sin bloquear en loading', async () => {
    const session = { user: { id: 'u1', email: 'user@rancho.com' }, access_token: 'tok' };
    const supabase = createMockSupabaseAuth(session);
    renderWithProvider(supabase);

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('session').textContent).toBe('user@rancho.com');
    // getSession() basta: no depende de una llamada de red adicional.
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
  });

  it('signIn exitoso actualiza session vía onAuthStateChange', async () => {
    const supabase = createMockSupabaseAuth(null);
    renderWithProvider(supabase);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    screen.getByText('signin-ok').click();

    await waitFor(() => expect(screen.getByTestId('session').textContent).toBe('user@rancho.com'));
  });

  it('signIn con credenciales inválidas lanza y no cambia session', async () => {
    const supabase = createMockSupabaseAuth(null);
    renderWithProvider(supabase);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    screen.getByText('signin-bad').click();

    await waitFor(() => expect(screen.getByTestId('err').textContent).toBe('Invalid login credentials'));
    expect(screen.getByTestId('session').textContent).toBe('none');
  });

  it('signOut limpia la sesión', async () => {
    const session = { user: { id: 'u1', email: 'user@rancho.com' }, access_token: 'tok' };
    const supabase = createMockSupabaseAuth(session);
    renderWithProvider(supabase);
    await waitFor(() => expect(screen.getByTestId('session').textContent).toBe('user@rancho.com'));

    screen.getByText('signout').click();

    await waitFor(() => expect(screen.getByTestId('session').textContent).toBe('none'));
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
