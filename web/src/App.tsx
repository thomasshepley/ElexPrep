import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { DashboardIcon, JobsIcon, SettingsIcon, SignageIcon, SignOutIcon } from './components/Icons'
import ThemeToggle from './components/ThemeToggle'
import NotificationBell from './components/NotificationBell'
import VersionBadge from './components/VersionBadge'
import './App.css'

function App() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'SIGNAGE' && location.pathname !== '/signage') {
    return <Navigate to="/signage" replace />
  }
  if (user.role === 'CREW' && location.pathname !== '/crew') {
    return <Navigate to="/crew" replace />
  }

  const initial = user.displayName.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-sticky">
          <div className="sidebar-brand">
            <span className="sidebar-brand-mark" />
            <span className="sidebar-brand-text">ELEX Portal</span>
          </div>
          <nav className="sidebar-nav">
            <NavLink to="/" end aria-label="Dashboard">
              <DashboardIcon />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/jobs" aria-label="Jobs">
              <JobsIcon />
              <span>Jobs</span>
            </NavLink>
            <NavLink to="/settings" aria-label="Settings">
              <SettingsIcon />
              <span>Settings</span>
            </NavLink>
            <NavLink to="/signage" aria-label="Signage">
              <SignageIcon />
              <span>Signage</span>
            </NavLink>
          </nav>
          <div className="sidebar-user">
            <div className="sidebar-user-row">
              <span className="avatar">{initial}</span>
              <NavLink to="/settings/preferences" className="sidebar-username" aria-label={`${user.displayName} - preferences`}>
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
          </div>
        </div>
      </aside>
      <main className="shell-main">
        <div className="shell-main-inner">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default App
