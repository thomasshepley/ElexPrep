import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface SettingsSection {
  to: string;
  label: string;
  adminOnly?: boolean;
}

const SECTIONS: SettingsSection[] = [
  { to: '/settings/fixture-types', label: 'Case Rules' },
  { to: '/settings/location-colors', label: 'Location Colors' },
  { to: '/settings/import-mapping', label: 'Import Mapping' },
  { to: '/settings/printer', label: 'Printer', adminOnly: true },
  { to: '/settings/current-rms', label: 'Current RMS', adminOnly: true },
  { to: '/settings/users', label: 'Users', adminOnly: true },
  { to: '/settings/activity', label: 'Activity Log', adminOnly: true },
  { to: '/settings/preferences', label: 'My Preferences' },
];

export default function SettingsLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <div>
      <h1>Settings</h1>
      <div className="tabs">
        {sections.map((s) => (
          <NavLink key={s.to} to={s.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {s.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
