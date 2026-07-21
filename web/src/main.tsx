import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import JobsListPage from './pages/JobsListPage'
import JobDetailPage from './pages/JobDetailPage'
import FixtureTypeRulesPage from './pages/FixtureTypeRulesPage'
import ActivityLogPage from './pages/ActivityLogPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<JobsListPage />} />
          <Route path="jobs/:jobId" element={<JobDetailPage />} />
          <Route path="settings/fixture-types" element={<FixtureTypeRulesPage />} />
          <Route path="activity" element={<ActivityLogPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
