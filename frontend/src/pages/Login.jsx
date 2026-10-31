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
  { id: 'admin',   label: 'Administrator', icon: ShieldCheck,    hint: 'Username: admin  ·  Password: admin123'      },
  { id: 'teacher', label: 'Teacher',        icon: GraduationCap, hint: "Email: teacher's email  ·  Password: teacher123" },
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: '#F4F3FB',
        position: 'relative',
      }}
    >
      {/* Subtle background decoration — tinted, no neon */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(ellipse 70% 50% at 60% 20%, rgba(143,140,214,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="animate-fade-in"
        style={{ width: '100%', maxWidth: '420px', position: 'relative', zIndex: 1 }}
      >
        {/* Brand mark */}
        <div style={{ textAlign: 'left', marginBottom: '28px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: '#2E2A6B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={20} color="#FFB020" strokeWidth={2.5} />
            </div>
            <div>
              <p style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '1rem',
                fontWeight: 700,
                color: '#2E2A6B',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}>
                TimeTable
              </p>
              <p style={{
                fontFamily: 'Figtree, sans-serif',
                fontSize: '0.6875rem',
                color: 'var(--c-muted)',
                lineHeight: 1,
              }}>
                College generator
              </p>
            </div>
          </div>

          <h1
            style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: '1.625rem',
              fontWeight: 700,
              color: '#2E2A6B',
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            Sign in to your account
          </h1>
          <p style={{
            fontFamily: 'Figtree, sans-serif',
            fontSize: '0.9375rem',
            color: 'var(--c-muted)',
            marginTop: '6px',
          }}>
            Choose your role and enter your credentials below.
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid rgba(46,42,107,0.12)',
            borderRadius: '24px',
            boxShadow: '0 2px 8px rgba(46,42,107,0.08), 0 8px 24px rgba(46,42,107,0.10)',
            padding: '28px',
          }}
        >
          {/* Role tabs */}
          <fieldset style={{ border: 'none', padding: 0, marginBottom: '20px' }}>
            <legend
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#2E2A6B',
                marginBottom: '8px',
              }}
            >
              Sign in as
            </legend>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}
            >
              {ROLES.map(role => {
                const Icon = role.icon
                const active = selectedRole === role.id
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => { setSelectedRole(role.id); setError(''); setUsername(''); setPassword('') }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: active ? '2px solid #2E2A6B' : '1.5px solid rgba(46,42,107,0.15)',
                      background: active ? 'rgba(46,42,107,0.06)' : 'transparent',
                      color: active ? '#2E2A6B' : 'var(--c-muted)',
                      fontFamily: 'Figtree, sans-serif',
                      fontSize: '0.9375rem',
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.13s',
                      minHeight: '44px',
                    }}
                  >
                    <Icon size={15} strokeWidth={1.75} />
                    {role.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Demo credentials hint */}
          <div
            style={{
              marginBottom: '20px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(255,176,32,0.07)',
              border: '1px solid rgba(255,176,32,0.20)',
              fontSize: '0.8125rem',
              fontFamily: 'Figtree, sans-serif',
              color: '#8a6200',
              lineHeight: 1.5,
            }}
            role="note"
          >
            <strong style={{ color: '#6e4e00' }}>Demo:</strong>{' '}
            {currentRole?.hint}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Username / Email */}
            <div className="form-group">
              <label htmlFor="login-username" className="form-label">
                {selectedRole === 'admin' ? 'Username' : 'Email address'}
              </label>
              <div style={{ position: 'relative' }}>
                <User
                  size={15}
                  strokeWidth={1.75}
                  style={{
                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--c-muted)', pointerEvents: 'none',
                  }}
                  aria-hidden="true"
                />
                <input
                  id="login-username"
                  type={selectedRole === 'admin' ? 'text' : 'email'}
                  autoComplete={selectedRole === 'admin' ? 'username' : 'email'}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={selectedRole === 'admin' ? 'admin' : 'jane@college.edu'}
                  className="form-input"
                  style={{ paddingLeft: '38px' }}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="login-password" className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={15}
                  strokeWidth={1.75}
                  style={{
                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--c-muted)', pointerEvents: 'none',
                  }}
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="form-input"
                  style={{ paddingLeft: '38px', paddingRight: '42px' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--c-muted)', padding: '4px',
                    display: 'flex', alignItems: 'center',
                  }}
                  tabIndex={-1}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(220,38,38,0.07)',
                  border: '1px solid rgba(220,38,38,0.18)',
                  color: '#dc2626',
                  fontSize: '0.9375rem',
                  fontFamily: 'Figtree, sans-serif',
                }}
                className="animate-fade-in"
              >
                <AlertCircle size={15} strokeWidth={1.75} aria-hidden="true" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={busy}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '4px' }}
            >
              {busy && (
                <span
                  className="spinner"
                  style={{ width: '15px', height: '15px', borderWidth: '2px', borderColor: 'rgba(31,27,77,0.25)', borderTopColor: '#1F1B4D' }}
                  aria-hidden="true"
                />
              )}
              {busy ? 'Signing in…' : `Sign in as ${currentRole?.label}`}
            </button>
          </form>
        </div>

        <p
          style={{
            textAlign: 'center',
            fontSize: '0.8125rem',
            color: 'var(--c-muted)',
            marginTop: '20px',
            fontFamily: 'Figtree, sans-serif',
            opacity: 0.7,
          }}
        >
          College timetable generator · v0.1.0 · prototype
        </p>
      </div>
    </div>
  )
}
