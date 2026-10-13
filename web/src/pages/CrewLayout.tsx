import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { JobsIcon, SettingsIcon, SignOutIcon } from '../components/Icons';
import ThemeToggle from '../components/ThemeToggle';
import NotificationBell from '../components/NotificationBell';
import VersionBadge from '../components/VersionBadge';
import BugReportButton from '../components/BugReportButton';
import Avatar from '../components/Avatar';
import ForcedPasswordChange from '../components/ForcedPasswordChange';
import LockdownBanner from '../components/LockdownBanner';

/**
 * Shell for the whole crew portal (/crew/*) - a sibling to the admin/prep App shell and the
 * signage view, not nested inside either, matching the forced-redirect precedent those two
 * already use (see App.tsx). Reuses the same sidebar shell classes (App.css) for visual
 * consistency, just with its own (currently single-item) nav. The schedule (index route) and a
 * job's Who/What/When/Where page render below it via Outlet.
 *
 * Needs its own loading/logged-out/wrong-role guard, same as App.tsx - this route isn't nested
 * inside App, so App's guard never runs for it. Without this, signing out (which just clears
 * the in-memory user) left the shell rendering as if nothing happened, with individual panels
 * underneath failing their own API calls and showing a small "not authenticated" error instead
 * of the whole page redirecting to /login.
 */
export default function CrewLayout() {
  const { user, loading, logout } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'CREW') return <Navigate to="/" replace />;
  if (user.mustChangePassword) return <ForcedPasswordChange />;

  return (
    <>
      <LockdownBanner />
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
                <Avatar userId={user.id} displayName={user.displayName} hasAvatar={Boolean(user.avatarPath)} />
                <NavLink to="/crew/account" className="sidebar-username" aria-label={`${user.displayName} - account`}>
                  {user.displayName}
                </NavLink>
              </div>
              <NotificationBell />
              <ThemeToggle />
              <button className="secondary sidebar-signout" onClick={logout} aria-label="Sign out">
                <SignOutIcon />
                <span>Sign out</span>
              </button>
              <VersionBadge />
              <BugReportButton />
            </div>
          </div>
        </aside>
        <main className="shell-main">
          <div className="shell-main-inner">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  );
}
