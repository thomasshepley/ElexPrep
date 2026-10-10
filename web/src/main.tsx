import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext'
import LoginPage from './pages/LoginPage'
import SignagePage from './pages/SignagePage'
import CrewLayout from './pages/CrewLayout'
import CrewSchedulePage from './pages/CrewSchedulePage'
import CrewJobPage from './pages/CrewJobPage'
import JobsListPage from './pages/JobsListPage'
import JobDetailPage from './pages/JobDetailPage'
import SettingsLayout from './pages/SettingsLayout'
import FixtureTypeRulesPage from './pages/FixtureTypeRulesPage'
import LocationColorsPage from './pages/LocationColorsPage'
import ImportMappingPage from './pages/ImportMappingPage'
import UsersPage from './pages/UsersPage'
import CrewPage from './pages/CrewPage'
import PreferencesPage from './pages/PreferencesPage'
import PrinterSettingsPage from './pages/PrinterSettingsPage'
import CurrentRmsSettingsPage from './pages/CurrentRmsSettingsPage'
import ActivityLogPage from './pages/ActivityLogPage'
import PermissionsPage from './pages/PermissionsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signage" element={<SignagePage />} />
          <Route path="/crew" element={<CrewLayout />}>
            <Route index element={<CrewSchedulePage />} />
            <Route path="jobs/:jobId" element={<CrewJobPage />} />
          </Route>
          <Route path="/" element={<App />}>
            <Route index element={<JobsListPage />} />
            <Route path="jobs/:jobId" element={<JobDetailPage />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="fixture-types" replace />} />
              <Route path="fixture-types" element={<FixtureTypeRulesPage />} />
              <Route path="location-colors" element={<LocationColorsPage />} />
              <Route path="import-mapping" element={<ImportMappingPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="crew" element={<CrewPage />} />
              <Route path="permissions" element={<PermissionsPage />} />
              <Route path="printer" element={<PrinterSettingsPage />} />
              <Route path="current-rms" element={<CurrentRmsSettingsPage />} />
              <Route path="activity" element={<ActivityLogPage />} />
              <Route path="preferences" element={<PreferencesPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
