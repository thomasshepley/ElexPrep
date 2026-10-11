import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { DashboardIcon, JobsIcon, SettingsIcon, SignageIcon, SignOutIcon } from './components/Icons'
import ThemeToggle from './components/ThemeToggle'
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
            <NavLink to="/" end>
              <DashboardIcon />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/jobs">
              <JobsIcon />
              <span>Jobs</span>
            </NavLink>
            <NavLink to="/settings">
              <SettingsIcon />
              <span>Settings</span>
            </NavLink>
            <NavLink to="/signage">
              <SignageIcon />
              <span>Signage</span>
            </NavLink>
          </nav>
          <div className="sidebar-user">
            <div className="sidebar-user-row">
              <span className="avatar">{initial}</span>
              <NavLink to="/settings/preferences" className="sidebar-username">
                {user.displayName}
              </NavLink>
            </div>
            <ThemeToggle />
            <button className="secondary sidebar-signout" onClick={logout}>
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
  )
}

export default App
