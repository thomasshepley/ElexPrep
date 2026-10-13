import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import type { PermissionKey } from '../api/client';

interface SettingsSection {
  to: string;
  label: string;
  adminOnly?: boolean;
  /** Non-admin visibility additionally requires this permission (adminOnly must be false). */
  permission?: PermissionKey;
  /** Exclusive to WEBMASTER - not even ADMIN sees this section. */
  webmasterOnly?: boolean;
}

const GROUPS: { title: string; sections: SettingsSection[] }[] = [
  {
    title: 'Prep',
    sections: [
      { to: '/settings/fixture-types', label: 'Case Rules' },
      { to: '/settings/location-colors', label: 'Location Colours' },
      { to: '/settings/import-mapping', label: 'Import Mapping' },
      { to: '/settings/printer', label: 'Printer', adminOnly: true },
    ],
  },
  {
    title: 'Integrations',
    sections: [
      { to: '/settings/current-rms', label: 'Current RMS', adminOnly: true },
      { to: '/settings/onedrive', label: 'OneDrive', adminOnly: true },
    ],
  },
  {
    title: 'People',
    sections: [
      { to: '/settings/users', label: 'Users', adminOnly: true },
      { to: '/settings/crew', label: 'Crew', adminOnly: true },
      { to: '/settings/crew-applications', label: 'Applications', permission: 'manageCrewApplications' },
      { to: '/settings/onboarding', label: 'Onboarding', permission: 'manageCrewApplications' },
      { to: '/settings/crew-portal', label: 'Crew Portal', adminOnly: true },
    ],
  },
  {
    title: 'System',
    sections: [{ to: '/settings/activity', label: 'Activity Log', webmasterOnly: true }],
  },
];

export default function SettingsLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = isAdminRole(user?.role);
  const visible = (s: SettingsSection) => {
    if (s.webmasterOnly) return user?.role === 'WEBMASTER';
    if (s.adminOnly) return isAdmin;
    if (s.permission) return isAdmin || Boolean(user?.permissions?.[s.permission]);
    return true;
  };
  const groups = GROUPS.map((g) => ({ ...g, sections: g.sections.filter(visible) })).filter((g) => g.sections.length > 0);

  return (
    <div>
      <h1>Settings</h1>
      <div className="secondary-shell">
        <nav className="secondary-nav" aria-label="Settings">
          {groups.map((g) => (
            <div key={g.title} className="secondary-nav-group">
              <span className="secondary-nav-heading">{g.title}</span>
              {g.sections.map((s) => (
                <NavLink key={s.to} to={s.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  {s.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="secondary-content" key={pathname}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
