import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import './styles/global.css'

// Pages
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import StockPage from './pages/StockPage'
import InvoicesPage from './pages/InvoicesPage'
import DeliveriesPage from './pages/DeliveriesPage'
import SearchPage from './pages/SearchPage'
import KaifaStockList from './pages/KaifaStockList'
import ChinaReport from './pages/ChinaReport'
import AuditLog from './pages/AuditLog'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'
import HawbPage from './pages/HawbPage'

function PrivateRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-2)', fontFamily: 'JetBrains Mono' }}>Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="deliveries" element={<DeliveriesPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="kaifa-stock-list" element={<KaifaStockList />} />
        <Route path="china-report" element={<ChinaReport />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="users" element={<PrivateRoute adminOnly><UsersPage /></PrivateRoute>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="hawb" element={<PrivateRoute adminOnly><HawbPage /></PrivateRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--bg-3)',
              color: 'var(--text-0)',
              border: '1px solid var(--border)',
              fontFamily: 'Barlow, sans-serif',
            },
            success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--bg-3)' } },
            error: { iconTheme: { primary: 'var(--red)', secondary: 'var(--bg-3)' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  )
}
