import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import './App.css'

function App() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'SIGNAGE' && location.pathname !== '/signage') {
    return <Navigate to="/signage" replace />
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">ElexPrep</div>
        <nav>
          <NavLink to="/" end>Jobs</NavLink>
          <NavLink to="/settings/fixture-types">Case Rules</NavLink>
          <NavLink to="/settings/location-colors">Location Colors</NavLink>
          <NavLink to="/settings/import-mapping">Import Mapping</NavLink>
          {user.role === 'ADMIN' && <NavLink to="/settings/printer">Printer</NavLink>}
          {user.role === 'ADMIN' && <NavLink to="/settings/current-rms">Current RMS</NavLink>}
          {user.role === 'ADMIN' && <NavLink to="/settings/users">Users</NavLink>}
          {user.role === 'ADMIN' && <NavLink to="/activity">Activity Log</NavLink>}
          <NavLink to="/signage">Signage</NavLink>
        </nav>
        <div className="header-user">
          <NavLink to="/settings/preferences">{user.displayName}</NavLink>
          <button className="secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

export default App
