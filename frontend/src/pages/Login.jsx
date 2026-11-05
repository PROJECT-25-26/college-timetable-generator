/**
 * Login page — supports Admin and Teacher roles.
 * Features RouteTable brand logo, split responsive layout,
 * and quick-fill demo credentials.
 */

import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  User, Lock, Eye, EyeOff, ShieldCheck, GraduationCap,
  AlertCircle, Zap, MapPin, CheckCircle2, ArrowRight
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import logoImg from '../assets/logo.jpg'

const ROLES = [
  {
    id: 'admin',
    label: 'Administrator',
    icon: ShieldCheck,
    hintUsername: 'admin',
    hintPassword: 'admin123',
    hint: 'Username: admin · Password: admin123',
  },
  {
    id: 'teacher',
    label: 'Teacher',
    icon: GraduationCap,
    hintUsername: 'alice@college.edu',
    hintPassword: 'teacher123',
    hint: "Email: teacher's email · Password: teacher123",
  },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname ?? '/'

  const [selectedRole, setSelectedRole] = useState('admin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const currentRole = ROLES.find(r => r.id === selectedRole) || ROLES[0]

  const handleRoleChange = (roleId) => {
    setSelectedRole(roleId)
    setError('')
    setUsername('')
    setPassword('')
  }

  const fillDemoCredentials = () => {
    setUsername(currentRole.hintUsername)
    setPassword(currentRole.hintPassword)
    setError('')
  }

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

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        background: '#F4F3FB',
        position: 'relative',
      }}
    >
      {/* Background ambient lighting */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(ellipse 65% 50% at 50% 25%, rgba(143,140,214,0.14) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Main Container Card */}
      <div
        className="animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '920px',
          background: '#FFFFFF',
          borderRadius: '24px',
          boxShadow: '0 4px 12px rgba(46,42,107,0.06), 0 16px 40px rgba(46,42,107,0.12)',
          border: '1px solid rgba(46,42,107,0.10)',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* ── Left Column: Brand Hero Panel ───────────────────────────── */}
        <div
          style={{
            background: '#2E2A6B',
            color: '#FFFFFF',
            padding: '44px 38px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Top Brand Presentation */}
          <div>
            {/* Logo box */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                padding: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 20px rgba(0,0,0,0.22)',
                marginBottom: '26px',
                width: '112px',
                height: '112px',
              }}
            >
              <img
                src={logoImg}
                alt="RouteTable Logo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>

            <h1
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '1.75rem',
                fontWeight: 700,
                color: '#FFFFFF',
                letterSpacing: '-0.03em',
                lineHeight: 1.15,
                margin: '0 0 10px 0',
              }}
            >
              RouteTable
            </h1>

            <p
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontSize: '0.9375rem',
                color: 'rgba(255, 255, 255, 0.82)',
                lineHeight: 1.55,
                margin: '0 0 32px 0',
              }}
            >
              Intelligent college timetable generator with spatial campus walking minimization and zero clash guarantee.
            </p>

            {/* Feature Points */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'rgba(255, 176, 32, 0.15)',
                    border: '1px solid rgba(255, 176, 32, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <Zap size={15} color="#FFB020" />
                </div>
                <div>
                  <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.875rem', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>
                    OR-Tools CP-SAT Solver
                  </p>
                  <p style={{ fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.4, margin: '2px 0 0 0' }}>
                    Constraint satisfaction solving thousands of slot permutations per second.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'rgba(143, 140, 214, 0.20)',
                    border: '1px solid rgba(143, 140, 214, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <MapPin size={15} color="#8F8CD6" />
                </div>
                <div>
                  <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.875rem', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>
                    Spatial Campus Graph
                  </p>
                  <p style={{ fontSize: '0.8125rem', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.4, margin: '2px 0 0 0' }}>
                    Minimizes faculty walking distance and stair climbing across building gates.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Version Tag */}
          <div
            style={{
              paddingTop: '28px',
              borderTop: '1px solid rgba(255, 255, 255, 0.12)',
              marginTop: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.55)', fontFamily: 'Figtree, sans-serif' }}>
              Academic Scheduling System
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: '#FFB020',
                background: 'rgba(255, 176, 32, 0.12)',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 176, 32, 0.25)',
              }}
            >
              Version V1
            </span>
          </div>
        </div>

        {/* ── Right Column: Sign In Form ──────────────────────────────── */}
        <div
          style={{
            background: '#FFFFFF',
            padding: '44px 38px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: '24px' }}>
            <h2
              style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#1F1B4D',
                letterSpacing: '-0.025em',
                lineHeight: 1.2,
                margin: '0 0 6px 0',
              }}
            >
              Sign in to your account
            </h2>
            <p
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontSize: '0.9375rem',
                color: 'var(--c-muted)',
                margin: 0,
              }}
            >
              Select your role and enter your academic credentials.
            </p>
          </div>

          {/* Role tabs */}
          <fieldset style={{ border: 'none', padding: 0, marginBottom: '18px' }}>
            <legend
              style={{
                fontFamily: 'Figtree, sans-serif',
                fontSize: '0.8125rem',
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
                    onClick={() => handleRoleChange(role.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: active ? '2px solid #2E2A6B' : '1.5px solid rgba(46,42,107,0.15)',
                      background: active ? 'rgba(46,42,107,0.06)' : 'transparent',
                      color: active ? '#2E2A6B' : 'var(--c-muted)',
                      fontFamily: 'Figtree, sans-serif',
                      fontSize: '0.9375rem',
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.13s ease',
                      minHeight: '44px',
                    }}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                    <span>{role.label}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Demo credentials hint & quick fill */}
          <div
            style={{
              marginBottom: '20px',
              padding: '10px 14px',
              borderRadius: '12px',
              background: 'rgba(255, 176, 32, 0.08)',
              border: '1px solid rgba(255, 176, 32, 0.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              fontSize: '0.8125rem',
              fontFamily: 'Figtree, sans-serif',
              color: '#8a6200',
            }}
            role="note"
          >
            <div>
              <strong style={{ color: '#6e4e00' }}>Demo:</strong> {currentRole?.hint}
            </div>
            <button
              type="button"
              onClick={fillDemoCredentials}
              style={{
                background: '#FFB020',
                color: '#1F1B4D',
                border: 'none',
                borderRadius: '8px',
                padding: '4px 9px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'opacity 0.15s ease',
              }}
              title="Click to automatically fill credentials"
            >
              Fill demo
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Username / Email */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="login-username" className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1F1B4D', marginBottom: '6px', display: 'block' }}>
                {selectedRole === 'admin' ? 'Username' : 'Email address'}
              </label>
              <div style={{ position: 'relative' }}>
                <User
                  size={16}
                  strokeWidth={1.75}
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--c-muted)',
                    pointerEvents: 'none',
                  }}
                  aria-hidden="true"
                />
                <input
                  id="login-username"
                  type={selectedRole === 'admin' ? 'text' : 'email'}
                  autoComplete={selectedRole === 'admin' ? 'username' : 'email'}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={selectedRole === 'admin' ? 'admin' : 'alice@college.edu'}
                  className="form-input"
                  style={{
                    paddingLeft: '40px',
                    minHeight: '44px',
                    borderRadius: '12px',
                    border: '1.5px solid rgba(46,42,107,0.18)',
                    fontSize: '0.9375rem',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="login-password" className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1F1B4D', marginBottom: '6px', display: 'block' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={16}
                  strokeWidth={1.75}
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--c-muted)',
                    pointerEvents: 'none',
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
                  style={{
                    paddingLeft: '40px',
                    paddingRight: '44px',
                    minHeight: '44px',
                    borderRadius: '12px',
                    border: '1.5px solid rgba(46,42,107,0.18)',
                    fontSize: '0.9375rem',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--c-muted)',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '8px',
                  }}
                  tabIndex={-1}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(220,38,38,0.08)',
                  border: '1px solid rgba(220,38,38,0.22)',
                  color: '#dc2626',
                  fontSize: '0.875rem',
                  fontFamily: 'Figtree, sans-serif',
                }}
                className="animate-fade-in"
              >
                <AlertCircle size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={busy}
              style={{
                width: '100%',
                marginTop: '6px',
                minHeight: '46px',
                background: '#FFB020',
                color: '#1F1B4D',
                borderRadius: '12px',
                border: 'none',
                fontFamily: 'Figtree, sans-serif',
                fontSize: '0.9375rem',
                fontWeight: 600,
                cursor: busy ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                if (!busy) e.currentTarget.style.background = '#e69e1c'
              }}
              onMouseLeave={e => {
                if (!busy) e.currentTarget.style.background = '#FFB020'
              }}
            >
              {busy ? (
                <span
                  className="spinner"
                  style={{
                    width: '16px',
                    height: '16px',
                    borderWidth: '2px',
                    borderColor: 'rgba(31,27,77,0.25)',
                    borderTopColor: '#1F1B4D',
                  }}
                  aria-hidden="true"
                />
              ) : (
                <ArrowRight size={16} strokeWidth={2} />
              )}
              <span>{busy ? 'Signing in…' : `Sign in as ${currentRole?.label}`}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
