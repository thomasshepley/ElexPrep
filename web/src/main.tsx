import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext'
import LoginPage from './pages/LoginPage'
import SignagePage from './pages/SignagePage'
import JobsListPage from './pages/JobsListPage'
import JobDetailPage from './pages/JobDetailPage'
import FixtureTypeRulesPage from './pages/FixtureTypeRulesPage'
import ImportMappingPage from './pages/ImportMappingPage'
import UsersPage from './pages/UsersPage'
import PreferencesPage from './pages/PreferencesPage'
import ActivityLogPage from './pages/ActivityLogPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signage" element={<SignagePage />} />
          <Route path="/" element={<App />}>
            <Route index element={<JobsListPage />} />
            <Route path="jobs/:jobId" element={<JobDetailPage />} />
            <Route path="settings/fixture-types" element={<FixtureTypeRulesPage />} />
            <Route path="settings/import-mapping" element={<ImportMappingPage />} />
            <Route path="settings/users" element={<UsersPage />} />
            <Route path="settings/preferences" element={<PreferencesPage />} />
            <Route path="activity" element={<ActivityLogPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
