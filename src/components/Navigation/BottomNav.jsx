import { NavLink } from 'react-router-dom';
import './BottomNav.css';

const links = [
  { to: '/', label: 'Resumen', icon: '📊' },
  { to: '/animales', label: 'Animales', icon: '🐄' },
  { to: '/potreros', label: 'Potreros', icon: '🌿' },
  { to: '/reportes', label: 'Reportes', icon: '📈' },
  { to: '/calendario', label: 'Calendario', icon: '📅' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {links.map(({ to, label, icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className="bottom-nav__item">
          <span className="bottom-nav__icon">{icon}</span>
          <span className="bottom-nav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
