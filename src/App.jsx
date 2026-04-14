import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Rentals from './pages/Rentals'

function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/customers"     element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/rentals"       element={<Rentals />} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <MobileNav />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
