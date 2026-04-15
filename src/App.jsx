import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import MobileHeader from './components/MobileHeader'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Rentals from './pages/Rentals'
import RentalContract from './pages/RentalContract'

function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <MobileHeader />
      {/* pt-14 clears the fixed mobile header; pb-20 clears the fixed mobile bottom nav */}
      <main className="flex-1 min-w-0 pt-14 pb-20 md:pt-0 md:pb-0">
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/customers"     element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/rentals"       element={<Rentals />} />
          <Route path="/rentals/:id"   element={<RentalContract />} />
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
