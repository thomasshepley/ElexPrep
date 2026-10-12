import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { PermissionKey } from '../api/client';

interface SettingsSection {
  to: string;
  label: string;
  adminOnly?: boolean;
  /** Non-admin visibility additionally requires this permission (adminOnly must be false). */
  permission?: PermissionKey;
}

const SECTIONS: SettingsSection[] = [
  { to: '/settings/fixture-types', label: 'Case Rules' },
  { to: '/settings/location-colors', label: 'Location Colors' },
  { to: '/settings/import-mapping', label: 'Import Mapping' },
  { to: '/settings/printer', label: 'Printer', adminOnly: true },
  { to: '/settings/current-rms', label: 'Current RMS', adminOnly: true },
  { to: '/settings/onedrive', label: 'OneDrive', adminOnly: true },
  { to: '/settings/crew-portal', label: 'Crew Portal', adminOnly: true },
  { to: '/settings/users', label: 'Users', adminOnly: true },
  { to: '/settings/crew', label: 'Crew', adminOnly: true },
  { to: '/settings/crew-applications', label: 'Applications', permission: 'manageCrewApplications' },
  { to: '/settings/onboarding', label: 'Onboarding', permission: 'manageCrewApplications' },
  { to: '/settings/activity', label: 'Activity Log', permission: 'viewActivityLog' },
  { to: '/settings/preferences', label: 'My Preferences' },
];

export default function SettingsLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = user?.role === 'ADMIN';
  const sections = SECTIONS.filter((s) => {
    if (s.adminOnly) return isAdmin;
    if (s.permission) return isAdmin || Boolean(user?.permissions?.[s.permission]);
    return true;
  });

  return (
    <div>
      <h1>Settings</h1>
      <div className="secondary-shell">
        <nav className="secondary-nav">
          {sections.map((s) => (
            <NavLink key={s.to} to={s.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="secondary-content" key={pathname}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
