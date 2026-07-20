import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Suppliers from './pages/Suppliers'
import Receiving from './pages/Receiving'
import QC from './pages/QC'
import Inventory from './pages/Inventory'
import StockOpname from './pages/StockOpname'
import Quotation from './pages/Quotation'
import Invoice from './pages/Invoice'
import QCFailed from './pages/QCFailed'
import UserManagement from './pages/UserManagement'
import Settings from './pages/Settings'
import CommandCenter from './pages/CommandCenter'
import WorkflowRules from './pages/WorkflowRules'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="d-flex align-items-center justify-content-center min-vh-100"><div className="spinner-border text-primary" /></div>
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="receiving" element={<Receiving />} />
        <Route path="qc" element={<QC />} />
        <Route path="qc-failed" element={<QCFailed />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="stock-opname" element={<StockOpname />} />
        <Route path="quotation" element={<Quotation />} />
        <Route path="invoice" element={<Invoice />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="settings" element={<Settings />} />
        <Route path="command-center" element={<CommandCenter />} />
        <Route path="workflow-rules" element={<WorkflowRules />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <ToastContainer position="top-right" autoClose={3500} hideProgressBar={false} newestOnTop theme="colored" />
      </AuthProvider>
    </BrowserRouter>
  )
}
