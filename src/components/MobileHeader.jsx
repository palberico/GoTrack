import { logout } from '../firebase'
import { useAuth } from '../context/AuthContext'

export default function MobileHeader() {
  const { user } = useAuth()

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50 flex items-center justify-between px-4 h-14">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-green-500 rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <span className="font-semibold text-gray-900 text-base tracking-tight">Go Track</span>
      </div>

      {/* Sign out */}
      <button
        onClick={logout}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors py-1 px-2 rounded-lg hover:bg-gray-100"
        aria-label="Sign out"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        <span className="text-xs font-medium">Sign out</span>
      </button>
    </header>
  )
}
