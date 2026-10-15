import { PageSkeleton } from './components/Skeleton'
import { Suspense } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { DashboardIcon, JobsIcon, SettingsIcon, SignageIcon, SignOutIcon } from './components/Icons'
import ThemeToggle from './components/ThemeToggle'
import NotificationBell from './components/NotificationBell'
import VersionBadge from './components/VersionBadge'
import BugReportButton from './components/BugReportButton'
import Avatar from './components/Avatar'
import ForcedPasswordChange from './components/ForcedPasswordChange'
import LockdownBanner from './components/LockdownBanner'
import './App.css'
import UserName from './components/UserName';
import MobileTabBar from './components/MobileTabBar'
import { useIsPhone } from './hooks/useIsPhone'

function App() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()
  const phone = useIsPhone()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.mustChangePassword) return <ForcedPasswordChange />
  if (user.role === 'SIGNAGE' && location.pathname !== '/signage') {
    return <Navigate to="/signage" replace />
  }
  if (user.role === 'CREW' && location.pathname !== '/crew') {
    return <Navigate to="/crew" replace />
  }

  return (
    <>
      <LockdownBanner />
      <div className="shell">
        {phone ? (
          <MobileTabBar
            tabs={[
              { to: '/', end: true, label: 'Home', icon: <DashboardIcon /> },
              { to: '/jobs', label: 'Jobs', icon: <JobsIcon /> },
            ]}
            more={{
              header: (
                <NavLink to="/preferences" className="sheet-profile">
                  <Avatar userId={user.id} displayName={user.displayName} hasAvatar={Boolean(user.avatarPath)} size={44} />
                  <span>
                    <UserName as="strong" name={user.displayName} role={user.role} isProjectManager={user.isProjectManager} showPmChip={false} />
                    <span className="muted sheet-profile-sub">Profile, notifications and security</span>
                  </span>
                </NavLink>
              ),
              links: [
                { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
                { to: '/signage', label: 'Signage', icon: <SignageIcon /> },
                ...(user.role === 'WEBMASTER' ? [{ to: '/webmaster', label: 'Webmaster', icon: <SettingsIcon /> }] : []),
              ],
              footer: (
                <div className="sheet-footer">
                  <ThemeToggle />
                  <BugReportButton />
                  <button className="secondary sidebar-signout" onClick={logout}>
                    <SignOutIcon />
                    <span>Sign out</span>
                  </button>
                  <VersionBadge />
                </div>
              ),
            }}
          />
        ) : (
        <aside className="sidebar">
          <div className="sidebar-sticky">
            <div className="sidebar-brand">
              <img className="sidebar-brand-mark" src="/elex-mark.png" alt="" />
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
              {user.role === 'WEBMASTER' && (
                <NavLink to="/webmaster" aria-label="Webmaster">
                  <SettingsIcon />
                  <span>Webmaster</span>
                </NavLink>
              )}
            </nav>
            <div className="sidebar-user">
              <div className="sidebar-user-row">
                <Avatar userId={user.id} displayName={user.displayName} hasAvatar={Boolean(user.avatarPath)} />
                <NavLink to="/preferences" className="sidebar-username" aria-label={`${user.displayName} - preferences`}>
                  <UserName name={user.displayName} role={user.role} isProjectManager={user.isProjectManager} showPmChip={false} />
                </NavLink>
              </div>
              <div className="sidebar-actions">
                <NotificationBell />
                <ThemeToggle />
                <button className="secondary sidebar-signout" onClick={logout} aria-label="Sign out" title="Sign out">
                  <SignOutIcon />
                  <span>Sign out</span>
                </button>
              </div>
              <VersionBadge />
              <BugReportButton />
            </div>
          </div>
        </aside>
        )}
        <main className="shell-main">
          <div className="shell-main-inner">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </>
  )
}

export default App
