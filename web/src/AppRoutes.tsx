import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import App from './App.tsx'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import JobsListPage from './pages/JobsListPage'
import JobDetailPage from './pages/JobDetailPage'
import CrewLayout from './pages/CrewLayout'
import CrewSchedulePage from './pages/CrewSchedulePage'
import NotFoundPage from './pages/NotFoundPage'
import ErrorBoundary from './components/ErrorBoundary'
import { RouteTitle } from './pageTitle'

// Everything off the main staff/crew landing paths loads on demand, so first paint doesn't
// carry signage, settings, onboarding or the label editor.
const ApplyPage = lazy(() => import('./pages/ApplyPage'))
const OnboardPage = lazy(() => import('./pages/OnboardPage'))
const OnboardCompletePage = lazy(() => import('./pages/OnboardCompletePage'))
const SignagePage = lazy(() => import('./pages/SignagePage'))
const CrewJobPage = lazy(() => import('./pages/CrewJobPage'))
const CrewAccountPage = lazy(() => import('./pages/CrewAccountPage'))
const SettingsLayout = lazy(() => import('./pages/SettingsLayout'))
const FixtureTypeRulesPage = lazy(() => import('./pages/FixtureTypeRulesPage'))
const LocationColorsPage = lazy(() => import('./pages/LocationColorsPage'))
const ImportMappingPage = lazy(() => import('./pages/ImportMappingPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const CrewPage = lazy(() => import('./pages/CrewPage'))
const CrewApplicationsPage = lazy(() => import('./pages/CrewApplicationsPage'))
const PreferencesPage = lazy(() => import('./pages/PreferencesPage'))
const PrinterSettingsPage = lazy(() => import('./pages/PrinterSettingsPage'))
const CurrentRmsSettingsPage = lazy(() => import('./pages/CurrentRmsSettingsPage'))
const OneDriveSettingsPage = lazy(() => import('./pages/OneDriveSettingsPage'))
const CrewPortalSettingsPage = lazy(() => import('./pages/CrewPortalSettingsPage'))
const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const WebmasterPage = lazy(() => import('./pages/WebmasterPage'))

export default function AppRoutes() {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
      <RouteTitle />
      <Suspense fallback={<p className="muted route-loading">Loading…</p>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/apply" element={<ApplyPage />} />
          <Route path="/onboard" element={<OnboardPage />} />
          <Route path="/onboard/complete/:token" element={<OnboardCompletePage />} />
          <Route path="/signage" element={<SignagePage />} />
          <Route path="/crew" element={<CrewLayout />}>
            <Route index element={<CrewSchedulePage />} />
            <Route path="jobs/:jobId" element={<CrewJobPage />} />
            <Route path="account" element={<CrewAccountPage />} />
            <Route path="*" element={<NotFoundPage home="/crew" />} />
          </Route>
          <Route path="/" element={<App />}>
            <Route index element={<DashboardPage />} />
            <Route path="jobs" element={<JobsListPage />} />
            <Route path="jobs/:jobId" element={<JobDetailPage />} />
            <Route path="webmaster" element={<WebmasterPage />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="fixture-types" replace />} />
              <Route path="fixture-types" element={<FixtureTypeRulesPage />} />
              <Route path="location-colors" element={<LocationColorsPage />} />
              <Route path="import-mapping" element={<ImportMappingPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="crew" element={<CrewPage />} />
              <Route path="crew-applications" element={<CrewApplicationsPage />} />
              <Route path="onboarding" element={<OnboardingPage />} />
              <Route path="printer" element={<PrinterSettingsPage />} />
              <Route path="current-rms" element={<CurrentRmsSettingsPage />} />
              <Route path="onedrive" element={<OneDriveSettingsPage />} />
              <Route path="crew-portal" element={<CrewPortalSettingsPage />} />
              <Route path="activity" element={<ActivityLogPage />} />
              <Route path="preferences" element={<PreferencesPage />} />
              <Route path="*" element={<NotFoundPage home="/settings" />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
