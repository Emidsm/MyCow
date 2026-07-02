import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncContext } from '../../../providers/SyncContext.js';
import { SyncStatus } from '../SyncStatus.jsx';

// SyncStatus lee del contexto vía useSyncStatus/useSyncContext; se inyecta
// un valor mock directamente (sin montar SyncProvider real, que ataría el
// motor/Supabase reales) — mismo patrón de DI que src/sync/__tests__.
function renderWithContext(value) {
  return render(
    <SyncContext.Provider value={value}>
      <SyncStatus />
    </SyncContext.Provider>
  );
}

describe('SyncStatus', () => {
  it('deshabilita el botón de sync manual cuando está offline', () => {
    renderWithContext({ isOnline: false, pendingCount: 3, isSyncing: false, lastPullAt: null, syncNow: vi.fn() });

    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByText('3 pendientes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sincronizar/ })).toBeDisabled();
  });

  it('llama a syncNow() al hacer click estando online', () => {
    const syncNow = vi.fn();
    renderWithContext({ isOnline: true, pendingCount: 0, isSyncing: false, lastPullAt: null, syncNow });

    const button = screen.getByRole('button', { name: /Sincronizar/ });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('deshabilita el botón y muestra el spinner mientras isSyncing', () => {
    renderWithContext({ isOnline: true, pendingCount: 1, isSyncing: true, lastPullAt: null, syncNow: vi.fn() });

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText('Sincronizando…')).toBeInTheDocument();
  });
});
