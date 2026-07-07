import { NavLink } from 'react-router-dom';
import './BottomNav.css';

const links = [
  { to: '/', label: 'Resumen' },
  { to: '/animales', label: 'Animales' },
  { to: '/potreros', label: 'Potreros' },
  { to: '/reportes', label: 'Reportes' },
  { to: '/calendario', label: 'Calendario' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {links.map(({ to, label }) => (
        <NavLink key={to} to={to} end={to === '/'} className="bottom-nav__item">
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
