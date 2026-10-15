import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './auth/AuthContext'
import { ToastProvider } from './components/Toast'
import { DialogProvider } from './components/Dialog'
import AppRoutes from './AppRoutes'
import { startActionTracking } from './bugReport/actionTracker'

startActionTracking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <DialogProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </DialogProvider>
    </ToastProvider>
  </StrictMode>,
)
