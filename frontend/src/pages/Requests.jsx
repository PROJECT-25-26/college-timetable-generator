/**
 * Requests — Admin-only page.
 * Lists all teacher schedule-change requests and allows Approve / Reject.
 */

import { CheckCircle2, XCircle, Clock, InboxIcon, FilterIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useState } from 'react'

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  textColor: 'text-amber-400',   bg: 'bg-amber-500/10  border-amber-500/20'  },
  approved: { label: 'Approved', textColor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  rejected: { label: 'Rejected', textColor: 'text-red-400',     bg: 'bg-red-500/10    border-red-500/20'    },
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
    <div className="space-y-6 max-w-4xl animate-fade-in">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <InboxIcon size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Schedule Change Requests</h2>
            <p className="text-gray-400 text-xs mt-0.5">Review and action teacher-submitted requests</p>
          </div>
          {counts.pending > 0 && (
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
              {counts.pending} pending
            </span>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterIcon size={14} className="text-gray-500 shrink-0" />
        {(['all', 'pending', 'approved', 'rejected']).map(f => (
          <button
            key={f}
            id={`req-filter-${f}`}
            onClick={() => setFilter(f)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all border',
              filter === f
                ? 'bg-brand-600/25 text-brand-300 border-brand-500/30'
                : 'text-gray-400 border-white/10 hover:bg-white/5 hover:text-gray-200',
            ].join(' ')}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1.5 text-gray-500">({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* Request list */}
      {visible.length === 0 ? (
        <div className="glass-card p-12 flex flex-col items-center gap-3 text-gray-600">
          <InboxIcon size={36} strokeWidth={1} />
          <p className="text-sm">
            {filter === 'all' ? 'No requests yet.' : `No ${filter} requests.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(req => {
            const cfg = STATUS_CONFIG[req.status]
            return (
              <div
                key={req.id}
                className={`glass-card p-5 flex flex-col sm:flex-row sm:items-start gap-4 border ${
                  req.status === 'pending' ? 'border-amber-500/15' : 'border-white/10'
                } hover:bg-white/5 transition-colors`}
              >
                {/* Status icon */}
                <div className={`shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg} border`}>
                  {req.status === 'approved' && <CheckCircle2 size={16} className="text-emerald-400" />}
                  {req.status === 'rejected' && <XCircle     size={16} className="text-red-400"     />}
                  {req.status === 'pending'  && <Clock       size={16} className="text-amber-400"   />}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-100">{req.teacherName}</span>
                    <span className="text-xs text-gray-500">—</span>
                    <span className="text-sm text-gray-300">{req.day}, {req.period}</span>
                    <span className={`text-xs font-semibold ${cfg.textColor}`}>
                      · {cfg.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{req.reason}</p>
                  <p className="text-xs text-gray-600 mt-2">
                    Submitted {new Date(req.submittedAt).toLocaleString()}
                  </p>
                </div>

                {/* Action buttons */}
                {req.status === 'pending' && (
                  <div className="flex gap-2 shrink-0 sm:flex-col">
                    <button
                      id={`req-approve-${req.id}`}
                      onClick={() => updateRequestStatus(req.id, 'approved')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/25 hover:bg-emerald-600/30 transition-colors"
                    >
                      <CheckCircle2 size={13} /> Approve
                    </button>
                    <button
                      id={`req-reject-${req.id}`}
                      onClick={() => updateRequestStatus(req.id, 'rejected')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600/20 text-red-300 border border-red-500/25 hover:bg-red-600/30 transition-colors"
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
