import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { login, sendResetEmail } from '../firebase'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode]       = useState('login')   // 'login' | 'reset'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [resetSent, setResetSent] = useState(false)

  // Already signed in — go straight to the app
  if (!authLoading && user) return <Navigate to="/" replace />

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      console.error('Login error:', err.code, err.message)
      setError(friendlyError(err.code))
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (!email) { setError('Enter your email address first.'); return }
    setError('')
    setLoading(true)
    try {
      await sendResetEmail(email)
      setResetSent(true)
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setLoading(false)
    }
  }

  function friendlyError(code) {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Incorrect email or password.'
      case 'auth/invalid-email':
        return 'Please enter a valid email address.'
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.'
      case 'auth/user-disabled':
        return 'This account has been disabled.'
      default:
        return 'Something went wrong. Please try again.'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <span className="text-xl font-bold text-gray-900 tracking-tight">Go Track</span>
        </div>

        <div className="card p-8">
          {mode === 'login' ? (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-6">Sign in</h1>

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>

                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button type="submit" className="btn-primary w-full py-2.5 mt-1" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <button
                className="text-xs text-gray-400 hover:text-gray-600 mt-5 w-full text-center transition-colors"
                onClick={() => { setMode('reset'); setError(''); setResetSent(false) }}
              >
                Forgot password?
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setMode('login'); setError(''); setResetSent(false) }}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-5 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to sign in
              </button>

              <h1 className="text-lg font-semibold text-gray-900 mb-2">Reset password</h1>
              <p className="text-sm text-gray-400 mb-6">
                Enter your email and we'll send you a reset link.
              </p>

              {resetSent ? (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                  Reset email sent to <strong>{email}</strong>. Check your inbox.
                </div>
              ) : (
                <form onSubmit={handleReset} className="flex flex-col gap-4">
                  <div>
                    <label className="label">Email</label>
                    <input
                      type="email"
                      className="input"
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
                    {loading ? 'Sending…' : 'Send reset email'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
