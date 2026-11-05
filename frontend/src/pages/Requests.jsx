/**
 * Requests — Admin-only page.
 * Lists all teacher schedule-change requests and allows Approve / Reject.
 */

import { CheckCircle2, XCircle, Clock, Inbox, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  textColor: '#A07010', bg: 'rgba(255,176,32,0.08)',  border: 'rgba(255,176,32,0.25)'   },
  approved: { label: 'Approved', textColor: '#15803d', bg: 'rgba(22,163,74,0.08)',   border: 'rgba(22,163,74,0.25)'   },
  rejected: { label: 'Rejected', textColor: '#b91c1c', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.25)'   },
}

export default function Requests() {
  const { requests, updateRequestStatus } = useAuth()
  const [filter, setFilter] = useState('all')

  const visible = filter === 'all' ? requests : requests.filter(r => r.status === filter)

  const counts = {
    all:      requests.length,
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  return (
    <div className="page-wrapper">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-heading">Schedule change requests</h1>
          <p className="page-sub">Review and action teacher-submitted schedule adjustments</p>
        </div>
        {counts.pending > 0 && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 9999,
            background: 'rgba(255,176,32,0.12)',
            border: '1px solid rgba(255,176,32,0.30)',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#A07010',
          }}>
            <Clock size={14} />
            {counts.pending} pending
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <SlidersHorizontal size={14} style={{ color: 'var(--c-muted)', flexShrink: 0 }} />
        {(['all', 'pending', 'approved', 'rejected']).map(f => (
          <button
            key={f}
            id={`req-filter-${f}`}
            onClick={() => setFilter(f)}
            style={{
              padding: '7px 16px',
              borderRadius: 9999,
              fontSize: '0.875rem',
              fontWeight: 500,
              border: '1px solid',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: filter === f ? 'rgba(46,42,107,0.10)' : 'transparent',
              borderColor: filter === f ? 'rgba(46,42,107,0.30)' : 'var(--c-border)',
              color: filter === f ? '#2E2A6B' : 'var(--c-muted)',
              fontFamily: 'Figtree, sans-serif',
            }}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={{ marginLeft: 6, opacity: 0.6 }}>({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* Request list */}
      {visible.length === 0 ? (
        <div className="card-padded" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '64px 24px', textAlign: 'center' }}>
          <Inbox size={40} strokeWidth={1.2} style={{ color: 'var(--c-muted)', opacity: 0.5 }} />
          <p style={{ color: 'var(--c-muted)', fontSize: '0.9375rem' }}>
            {filter === 'all' ? 'No requests yet.' : `No ${filter} requests.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(req => {
            const cfg = STATUS_CONFIG[req.status]
            return (
              <div
                key={req.id}
                className="card"
                style={{
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  borderLeft: req.status === 'pending' ? '3px solid rgba(255,176,32,0.60)' : undefined,
                }}
              >
                {/* Status icon */}
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                  flexShrink: 0,
                  marginTop: 2,
                }}>
                  {req.status === 'approved' && <CheckCircle2 size={16} style={{ color: '#15803d' }} />}
                  {req.status === 'rejected' && <XCircle     size={16} style={{ color: '#b91c1c' }} />}
                  {req.status === 'pending'  && <Clock       size={16} style={{ color: '#A07010' }} />}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--c-body)' }}>{req.teacherName}</span>
                    <span style={{ color: 'var(--c-muted)' }}>—</span>
                    <span style={{ fontSize: '0.9375rem', color: 'var(--c-body)' }}>{req.day}, {req.period}</span>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: cfg.textColor,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      background: cfg.bg,
                      border: `1px solid ${cfg.border}`,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.9375rem', color: 'var(--c-muted)', marginBottom: 6 }}>{req.reason}</p>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--c-muted)', opacity: 0.7 }}>
                    Submitted {new Date(req.submittedAt).toLocaleString()}
                  </p>
                </div>

                {/* Action buttons */}
                {req.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      id={`req-approve-${req.id}`}
                      onClick={() => updateRequestStatus(req.id, 'approved')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 14px',
                        borderRadius: 9,
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        background: 'rgba(22,163,74,0.08)',
                        color: '#15803d',
                        border: '1px solid rgba(22,163,74,0.25)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        fontFamily: 'Figtree, sans-serif',
                        minHeight: 36,
                      }}
                    >
                      <CheckCircle2 size={13} /> Approve
                    </button>
                    <button
                      id={`req-reject-${req.id}`}
                      onClick={() => updateRequestStatus(req.id, 'rejected')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 14px',
                        borderRadius: 9,
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        background: 'rgba(220,38,38,0.08)',
                        color: '#b91c1c',
                        border: '1px solid rgba(220,38,38,0.25)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        fontFamily: 'Figtree, sans-serif',
                        minHeight: 36,
                      }}
                    >
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
