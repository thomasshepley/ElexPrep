import { NavLink, Outlet } from 'react-router-dom'
import './App.css'

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">ElexPrep</div>
        <nav>
          <NavLink to="/" end>Jobs</NavLink>
          <NavLink to="/settings/fixture-types">Case Rules</NavLink>
          <NavLink to="/activity">Activity Log</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

export default App
