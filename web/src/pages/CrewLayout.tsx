import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * Shell for the whole crew portal (/crew/*) — a sibling to the admin/prep App shell and the
 * signage view, not nested inside either, matching the forced-redirect precedent those two
 * already use (see App.tsx). Deliberately minimal: a brand bar and the crew member's own name,
 * no admin nav. The schedule (index route) and a job's Who/What/When/Where page render below
 * it via Outlet.
 */
export default function CrewLayout() {
  const { user, logout } = useAuth();
  const initial = user?.displayName?.trim().charAt(0).toUpperCase() ?? '?';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">ELEX Portal</div>
        <nav>
          <NavLink to="/crew" end>
            Schedule
          </NavLink>
        </nav>
        <div className="header-user">
          <span className="avatar">{initial}</span>
          <span>{user?.displayName}</span>
          <button className="secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
