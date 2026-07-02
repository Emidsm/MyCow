import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'mycow_theme';

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // localStorage puede no estar disponible (modo privado, SSR); degrada
    // a "sin preferencia guardada" y usa prefers-color-scheme.
    return null;
  }
}

/**
 * Maneja el tema claro/oscuro. Sin preferencia explícita del usuario, el
 * documento no lleva `data-theme` y las media queries de tokens.css aplican
 * `prefers-color-scheme` como default. Al elegir manualmente, se fija
 * `data-theme` en <html> y se persiste en localStorage.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => readStoredTheme());

  useEffect(() => {
    const root = document.documentElement;
    if (theme) {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
      const effectiveCurrent = current ?? (prefersDark ? 'dark' : 'light');
      const next = effectiveCurrent === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // sin persistencia disponible: el toggle sigue funcionando en memoria
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
