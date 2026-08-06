/**
 * Login page — supports Admin and Teacher roles.
 * Admin  : username "admin"        / password "admin123"
 * Teacher: username <email prefix> / password "teacher123"
 */

import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Zap, User, Lock, Eye, EyeOff, ShieldCheck, GraduationCap, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const ROLES = [
  { id: 'admin',   label: 'Administrator', icon: ShieldCheck,    hint: 'username: admin  •  password: admin123'      },
  { id: 'teacher', label: 'Teacher',        icon: GraduationCap, hint: 'username: <email-prefix>  •  password: teacher123' },
]

export default function Login() {
  const { login }    = useAuth()
  const navigate     = useNavigate()
  const location     = useLocation()
  const from         = location.state?.from?.pathname ?? '/'

  const [selectedRole, setSelectedRole] = useState('admin')
  const [username, setUsername]         = useState('')
  const [password, setPassword]         = useState('')
  const [showPw,   setShowPw]           = useState(false)
  const [error,    setError]            = useState('')
  const [busy,     setBusy]             = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const result = await login(username, password)
    setBusy(false)
    if (result.ok) {
      // Role-aware redirect
      if (selectedRole === 'teacher') {
        navigate('/teacher-dashboard', { replace: true })
      } else {
        navigate(from === '/login' ? '/' : from, { replace: true })
      }
    } else {
      setError(result.error)
    }
  }

  const currentRole = ROLES.find(r => r.id === selectedRole)

  return (
    <div className="login-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-brand-500/40 mb-4">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold gradient-text">College Timetable</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
        </div>

        <div className="glass-card p-8 shadow-2xl">
          {/* Role selector */}
          <div className="flex rounded-xl overflow-hidden border border-white/10 mb-6 bg-white/5">
            {ROLES.map(role => {
              const Icon = role.icon
              const active = selectedRole === role.id
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => { setSelectedRole(role.id); setError(''); setUsername(''); setPassword('') }}
                  className={[
                    'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all duration-200',
                    active
                      ? 'bg-brand-600/30 text-brand-300 border-b-2 border-brand-400'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
                  ].join(' ')}
                >
                  <Icon size={15} />
                  {role.label}
                </button>
              )
            })}
          </div>

          {/* Hint */}
          <div className="mb-5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-500">
            <span className="text-gray-400 font-medium">Demo credentials: </span>{currentRole?.hint}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label htmlFor="login-username" className="form-label">Username</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={selectedRole === 'admin' ? 'admin' : 'e.g. john.doe'}
                  className="form-input pl-9"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="form-label">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="form-input pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fade-in">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={busy}
              className={[
                'w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
                'bg-gradient-to-r from-brand-600 to-purple-600 text-white',
                'hover:from-brand-500 hover:to-purple-500 hover:shadow-lg hover:shadow-brand-500/25',
                busy ? 'opacity-60 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {busy ? 'Signing in…' : `Sign in as ${currentRole?.label}`}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          College Timetable Generator v0.1.0 · prototype
        </p>
      </div>

      <style>{`
        .login-bg {
          background: radial-gradient(ellipse 80% 60% at 50% -10%, hsl(250 70% 12%), transparent),
                      radial-gradient(ellipse 60% 50% at 80% 80%, hsl(220 60% 10%), transparent),
                      hsl(222 47% 5%);
        }
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.18;
          pointer-events: none;
        }
        .orb-1 {
          width: 420px; height: 420px;
          background: hsl(250 80% 60%);
          top: -100px; left: -120px;
          animation: orb-drift 8s ease-in-out infinite alternate;
        }
        .orb-2 {
          width: 320px; height: 320px;
          background: hsl(210 90% 55%);
          bottom: -80px; right: -100px;
          animation: orb-drift 10s ease-in-out infinite alternate-reverse;
        }
        @keyframes orb-drift {
          from { transform: translate(0, 0); }
          to   { transform: translate(30px, 20px); }
        }
      `}</style>
    </div>
  )
}
