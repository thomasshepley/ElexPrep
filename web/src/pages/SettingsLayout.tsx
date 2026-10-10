import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface SettingsSection {
  to: string;
  label: string;
  adminOnly?: boolean;
  /** Non-admin visibility additionally requires this permission (adminOnly must be false). */
  permission?: 'viewActivityLog';
}

const SECTIONS: SettingsSection[] = [
  { to: '/settings/fixture-types', label: 'Case Rules' },
  { to: '/settings/location-colors', label: 'Location Colors' },
  { to: '/settings/import-mapping', label: 'Import Mapping' },
  { to: '/settings/printer', label: 'Printer', adminOnly: true },
  { to: '/settings/current-rms', label: 'Current RMS', adminOnly: true },
  { to: '/settings/users', label: 'Users', adminOnly: true },
  { to: '/settings/crew', label: 'Crew', adminOnly: true },
  { to: '/settings/permissions', label: 'Permissions', adminOnly: true },
  { to: '/settings/activity', label: 'Activity Log', permission: 'viewActivityLog' },
  { to: '/settings/preferences', label: 'My Preferences' },
];

export default function SettingsLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const sections = SECTIONS.filter((s) => {
    if (s.adminOnly) return isAdmin;
    if (s.permission) return isAdmin || Boolean(user?.permissions?.[s.permission]);
    return true;
  });

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
