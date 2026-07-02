import { useTheme } from './useTheme.js';
import './ThemeToggle.css';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark' || (!theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={isDark ? 'Tema oscuro' : 'Tema claro'}
    >
      {isDark ? '🌙' : '☀️'}
    </button>
  );
}
