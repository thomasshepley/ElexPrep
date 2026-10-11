import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { JobsIcon, SignOutIcon } from '../components/Icons';

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
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" />
          <span className="sidebar-brand-text">ELEX Portal</span>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/crew" end>
            <JobsIcon />
            <span>Schedule</span>
          </NavLink>
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-row">
            <span className="avatar">{initial}</span>
            <span className="sidebar-username">{user?.displayName}</span>
          </div>
          <button className="secondary sidebar-signout" onClick={logout}>
            <SignOutIcon />
            <span>Sign out</span>
          </button>
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
