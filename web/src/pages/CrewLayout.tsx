import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { JobsIcon, SettingsIcon, SignOutIcon } from '../components/Icons';
import ThemeToggle from '../components/ThemeToggle';
import NotificationBell from '../components/NotificationBell';

/**
 * Shell for the whole crew portal (/crew/*) — a sibling to the admin/prep App shell and the
 * signage view, not nested inside either, matching the forced-redirect precedent those two
 * already use (see App.tsx). Reuses the same sidebar shell classes (App.css) for visual
 * consistency, just with its own (currently single-item) nav. The schedule (index route) and a
 * job's Who/What/When/Where page render below it via Outlet.
 */
export default function CrewLayout() {
  const { user, logout } = useAuth();
  const initial = user?.displayName?.trim().charAt(0).toUpperCase() ?? '?';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-sticky">
          <div className="sidebar-brand">
            <span className="sidebar-brand-mark" />
            <span className="sidebar-brand-text">ELEX Portal</span>
          </div>
          <nav className="sidebar-nav">
            <NavLink to="/crew" end aria-label="Schedule">
              <JobsIcon />
              <span>Schedule</span>
            </NavLink>
            <NavLink to="/crew/account" aria-label="My account">
              <SettingsIcon />
              <span>My account</span>
            </NavLink>
          </nav>
          <div className="sidebar-user">
            <div className="sidebar-user-row">
              <span className="avatar">{initial}</span>
              <NavLink to="/crew/account" className="sidebar-username" aria-label={`${user?.displayName} — account`}>
                {user?.displayName}
              </NavLink>
            </div>
            <NotificationBell />
            <ThemeToggle />
            <button className="secondary sidebar-signout" onClick={logout} aria-label="Sign out">
              <SignOutIcon />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>
      <main className="shell-main">
        <div className="shell-main-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
