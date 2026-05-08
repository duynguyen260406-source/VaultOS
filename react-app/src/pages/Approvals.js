import { html } from '../lib/html.js';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { clearDataCache } from '../lib/dataCache.js';
import { fmt } from '../lib/utils.js';
import { Spinner, LoadingRow } from '../components/Spinner.js';

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_META = {
  pending:  { label: 'Pending',  color: '#f5a623', bg: 'rgba(245,166,35,.12)',  border: 'rgba(245,166,35,.3)',  pulse: true  },
  approved: { label: 'Approved', color: '#22c55e', bg: 'rgba(34,197,94,.12)',   border: 'rgba(34,197,94,.3)',   pulse: false },
  rejected: { label: 'Rejected', color: '#ef4444', bg: 'rgba(239,68,68,.12)',   border: 'rgba(239,68,68,.3)',   pulse: false },
  executed: { label: 'Executed', color: '#60a5fa', bg: 'rgba(96,165,250,.12)',  border: 'rgba(96,165,250,.3)',  pulse: false },
  failed:   { label: 'Failed',   color: '#f87171', bg: 'rgba(248,113,113,.12)', border: 'rgba(248,113,113,.3)', pulse: false },
};

const TYPE_META = {
  deposit:      { label: 'Deposit',      color: '#22c55e', icon: '↑' },
  withdraw:     { label: 'Withdrawal',   color: '#ef4444', icon: '↓' },
  transfer:     { label: 'Transfer',     color: '#f5a623', icon: '⇄' },
  close_account:{ label: 'Close Account',color: '#a78bfa', icon: '✕' },
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatPayload(type, payload) {
  if (!payload) return '—';
  const amt = payload.amount ? fmt.currency(Number(payload.amount)) : '';
  if (type === 'deposit')       return `Acc #${payload.account_id}  ·  ${amt}`;
  if (type === 'withdraw')      return `Acc #${payload.account_id}  ·  ${amt}`;
  if (type === 'transfer')      return `#${payload.from_account_id} → #${payload.to_account_id}  ·  ${amt}`;
  if (type === 'close_account') return `Acc #${payload.account_id}`;
  return JSON.stringify(payload);
}

function timeAgo(dt) {
  if (!dt) return '—';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return fmt.date(dt);
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KPI({ label, value, color = 'var(--foreground)' }) {
  return html`
    <div style=${{
      flex: 1, minWidth: 120,
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 18px',
    }}>
      <div style=${{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>${label}</div>
      <div style=${{ fontSize: 26, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>${value}</div>
    </div>
  `;
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return html`
    <span style=${{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>
      <span style=${{
        width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0,
        animation: m.pulse ? 'vlt-pulse 1.6s ease-in-out infinite' : 'none',
      }} />
      ${m.label}
    </span>
  `;
}

// ─── Decide modal ─────────────────────────────────────────────────────────────

function DecideModal({ approval, action, onClose, onDone }) {
  const { addToast } = useToast();
  const [notes, setNotes]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isReject = action === 'rejected';
  const meta = isReject
    ? { label: 'Reject',  color: '#ef4444', bg: 'rgba(239,68,68,.1)',  border: 'rgba(239,68,68,.25)' }
    : { label: 'Approve', color: '#22c55e', bg: 'rgba(34,197,94,.1)',  border: 'rgba(34,197,94,.25)' };

  async function submit() {
    if (isReject && !notes.trim()) {
      addToast('Review notes are required for rejection.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.decideApproval(approval.approval_id, {
        decision: action,
        review_notes: notes || null,
      });
      addToast(res.message || `${meta.label}d successfully.`, res.success ? 'success' : 'error');
      onDone();
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const type  = approval.request_type;
  const typem = TYPE_META[type] || {};

  return html`
    <div onClick=${e => { if (e.target === e.currentTarget && !submitting) onClose(); }}
      style=${{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style=${{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 14, width: '100%', maxWidth: 480,
        boxShadow: '0 40px 100px rgba(0,0,0,.8)',
        overflow: 'hidden',
      }}>
        <!-- header -->
        <div style=${{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: meta.bg,
        }}>
          <span style=${{ fontSize: 13, fontWeight: 700, color: meta.color }}>
            ${isReject ? '✕ Reject Transaction' : '✓ Approve Transaction'}
          </span>
          <button onClick=${onClose} disabled=${submitting}
            style=${{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- body -->
        <div style=${{ padding: '20px' }}>
          <!-- transaction summary -->
          <div style=${{
            background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 18,
          }}>
            <div style=${{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style=${{ fontSize: 18, color: typem.color }}>${typem.icon || '○'}</span>
              <span style=${{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                ${typem.label || type}
              </span>
              <span style=${{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted-foreground)' }}>
                #${approval.approval_id}
              </span>
            </div>
            <div style=${{ fontFamily: 'monospace', fontSize: 13, color: 'var(--foreground)', lineHeight: 1.6 }}>
              ${formatPayload(type, approval.payload)}
            </div>
            <div style=${{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style=${{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                Requested by <strong style=${{ color: 'var(--foreground)' }}>${approval.requested_by_username}</strong>
              </span>
              <span style=${{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                ${fmt.datetime(approval.requested_at)}
              </span>
              ${approval.branch_name && html`
                <span style=${{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                  ${approval.branch_name}
                </span>
              `}
            </div>
          </div>

          <!-- notes -->
          <label style=${{ display: 'block', marginBottom: 16 }}>
            <div style=${{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 6, letterSpacing: '.05em', textTransform: 'uppercase' }}>
              Review Notes ${isReject ? html`<span style=${{ color: '#ef4444' }}>*</span>` : '(optional)'}
            </div>
            <textarea
              value=${notes}
              onInput=${e => setNotes(e.target.value)}
              placeholder=${isReject ? 'State reason for rejection…' : 'Add any notes for the audit trail…'}
              rows="3"
              style=${{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px',
                color: 'var(--foreground)', fontSize: 13, resize: 'vertical',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
          </label>

          <!-- actions -->
          <div style=${{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick=${onClose} disabled=${submitting}
              style=${{
                padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--muted-foreground)',
                cursor: 'pointer', fontSize: 13,
              }}>
              Cancel
            </button>
            <button onClick=${submit} disabled=${submitting}
              style=${{
                padding: '8px 22px', borderRadius: 8, border: `1px solid ${meta.border}`,
                background: meta.bg, color: meta.color,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                opacity: submitting ? .6 : 1,
              }}>
              ${submitting ? html`<${Spinner} size=${14} /> Processing…` : `${meta.label} Transaction`}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ApprovalRow({ approval, role, onDecide, onRetry }) {
  const type  = approval.request_type;
  const typem = TYPE_META[type] || { label: type, color: '#a1a1a1', icon: '○' };
  const [expanded, setExpanded] = useState(false);

  return html`
    <>
      <tr
        onClick=${() => setExpanded(v => !v)}
        style=${{ cursor: 'pointer', transition: 'background .15s' }}
        className="approval-row"
      >
        <td style=${{ padding: '11px 14px', width: 50 }}>
          <span style=${{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted-foreground)' }}>
            #${approval.approval_id}
          </span>
        </td>
        <td style=${{ padding: '11px 14px' }}>
          <span style=${{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 600, color: typem.color,
          }}>
            <span style=${{ fontSize: 14 }}>${typem.icon}</span>
            ${typem.label}
          </span>
        </td>
        <td style=${{ padding: '11px 14px' }}>
          <span style=${{ fontFamily: 'monospace', fontSize: 12, color: 'var(--foreground)' }}>
            ${formatPayload(type, approval.payload)}
          </span>
        </td>
        <td style=${{ padding: '11px 14px', fontSize: 12, color: 'var(--muted-foreground)' }}>
          ${approval.requested_by_username}
        </td>
        <td style=${{ padding: '11px 14px', fontSize: 12, color: 'var(--muted-foreground)' }}>
          ${approval.branch_name || '—'}
        </td>
        <td style=${{ padding: '11px 14px', fontSize: 12, color: 'var(--muted-foreground)' }}>
          ${timeAgo(approval.requested_at)}
        </td>
        <td style=${{ padding: '11px 14px' }}>
          <${StatusPill} status=${approval.status} />
        </td>
        <td style=${{ padding: '11px 10px', textAlign: 'right' }} onClick=${e => e.stopPropagation()}>
          ${role === 'manager' && approval.status === 'pending' && html`
            <div style=${{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                onClick=${() => onDecide(approval, 'approved')}
                style=${{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(34,197,94,.3)',
                  background: 'rgba(34,197,94,.1)', color: '#22c55e',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}>
                Approve
              </button>
              <button
                onClick=${() => onDecide(approval, 'rejected')}
                style=${{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,.3)',
                  background: 'rgba(239,68,68,.1)', color: '#ef4444',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                }}>
                Reject
              </button>
            </div>
          `}
          ${role === 'manager' && approval.status === 'failed' && html`
            <button
              onClick=${() => onRetry(approval.approval_id)}
              style=${{
                padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(245,166,35,.3)',
                background: 'rgba(245,166,35,.1)', color: '#f5a623',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
              }}>
              Retry
            </button>
          `}
        </td>
      </tr>
      ${expanded && html`
        <tr style=${{ background: 'rgba(255,255,255,.015)' }}>
          <td colSpan="8" style=${{ padding: '0 14px 14px 50px' }}>
            <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10, paddingTop: 12 }}>
              ${approval.reviewed_by_username && html`
                <div>
                  <div style=${{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Reviewed By</div>
                  <div style=${{ fontSize: 12, color: 'var(--foreground)' }}>${approval.reviewed_by_username} · ${timeAgo(approval.reviewed_at)}</div>
                </div>
              `}
              ${approval.review_notes && html`
                <div style=${{ gridColumn: '1 / -1' }}>
                  <div style=${{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Review Notes</div>
                  <div style=${{ fontSize: 12, color: 'var(--foreground)', fontStyle: 'italic' }}>"${approval.review_notes}"</div>
                </div>
              `}
              ${approval.execution_error && html`
                <div style=${{ gridColumn: '1 / -1' }}>
                  <div style=${{ fontSize: 10, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Execution Error</div>
                  <div style=${{ fontSize: 12, color: '#f87171', fontFamily: 'monospace' }}>${approval.execution_error}</div>
                </div>
              `}
              <div>
                <div style=${{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Payload</div>
                <div style=${{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                  ${JSON.stringify(approval.payload)}
                </div>
              </div>
            </div>
          </td>
        </tr>
      `}
    </>
  `;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Approvals() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const role = user?.role;

  const TABS = role === 'teller'
    ? [['mine', 'My Requests']]
    : role === 'auditor'
    ? [['all', 'All Records']]
    : [['pending', 'Pending Queue'], ['all', 'All Records'], ['mine', 'My Requests']];

  const [activeTab, setActiveTab]   = useState(TABS[0][0]);
  const [approvals, setApprovals]   = useState([]);
  const [stats, setStats]           = useState({ pending: 0, approved_today: 0, rejected_today: 0, executed_today: 0 });
  const [loading, setLoading]       = useState(false);
  const [decideModal, setDecideModal] = useState(null);

  const load = useCallback(async () => {
    clearDataCache();
    setLoading(true);
    try {
      let data;
      if (activeTab === 'mine') {
        data = await api.listMyApprovals();
      } else if (activeTab === 'pending') {
        data = await api.listApprovals({ status: 'pending' });
      } else {
        data = await api.listApprovals();
      }
      setApprovals(data.approvals || []);
      if (data.stats) setStats(data.stats);
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { load(); }, [load]);

  async function handleRetry(approvalId) {
    try {
      const res = await api.retryApproval(approvalId);
      addToast(res.message || 'Retry completed.', res.success ? 'success' : 'error');
      load();
    } catch (e) {
      addToast(e.message, 'error');
    }
  }

  const TH = ({ children, w }) => html`
    <th style=${{
      padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600,
      color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.07em',
      borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,.02)',
      whiteSpace: 'nowrap', width: w,
    }}>${children}</th>
  `;

  return html`
    <>
      <style>${`
        @keyframes vlt-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: .35; transform: scale(.85); }
        }
        .approval-row:hover { background: rgba(255,255,255,.028) !important; }
      `}</style>

      <header className="topbar">
        <span className="topbar-title">Approval Queue</span>
        <button onClick=${load}
          style=${{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--muted-foreground)',
                    cursor: 'pointer', fontSize: 12 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
      </header>

      <div className="page">
        <!-- KPIs -->
        <div style=${{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <${KPI} label="Pending" value=${stats.pending} color="#f5a623" />
          <${KPI} label="Approved Today" value=${stats.approved_today} color="#22c55e" />
          <${KPI} label="Rejected Today" value=${stats.rejected_today} color="#ef4444" />
          <${KPI} label="Executed Today" value=${stats.executed_today} color="#60a5fa" />
        </div>

        <!-- Tabs -->
        <div className="tabs" style=${{ marginBottom: 20 }}>
          ${TABS.map(([key, label]) => html`
            <div key=${key}
              className=${'tab' + (activeTab === key ? ' active' : '')}
              onClick=${() => setActiveTab(key)}
              style=${{ display: 'flex', alignItems: 'center', gap: 7 }}>
              ${key === 'pending' && stats.pending > 0 && html`
                <span style=${{
                  minWidth: 18, height: 18, borderRadius: 9,
                  background: '#f5a623', color: '#000',
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 5px',
                }}>${stats.pending}</span>
              `}
              ${label}
            </div>
          `)}
        </div>

        <!-- Table -->
        <div className="card" style=${{ padding: 0, overflow: 'hidden' }}>
          ${loading
            ? html`<div style=${{ padding: 40, textAlign: 'center' }}><${Spinner} /></div>`
            : approvals.length === 0
            ? html`
              <div style=${{
                padding: '52px 20px', textAlign: 'center',
                color: 'var(--muted-foreground)', fontSize: 13,
              }}>
                ${activeTab === 'pending' ? 'No pending approvals.' : 'No records found.'}
              </div>
            `
            : html`
              <div style=${{ overflowX: 'auto' }}>
                <table style=${{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <${TH} w="50">ID<//>
                      <${TH} w="110">Type<//>
                      <${TH}>Details<//>
                      <${TH} w="110">Requested By<//>
                      <${TH} w="110">Branch<//>
                      <${TH} w="90">Time<//>
                      <${TH} w="100">Status<//>
                      <${TH} w="160"><//>
                    </tr>
                  </thead>
                  <tbody>
                    ${approvals.map(a => html`
                      <${ApprovalRow}
                        key=${a.approval_id}
                        approval=${a}
                        role=${role}
                        onDecide=${(approval, action) => setDecideModal({ approval, action })}
                        onRetry=${handleRetry}
                      />
                    `)}
                  </tbody>
                </table>
              </div>
            `
          }
        </div>

        <!-- count -->
        ${!loading && approvals.length > 0 && html`
          <div style=${{ marginTop: 10, fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'right' }}>
            ${approvals.length} record${approvals.length !== 1 ? 's' : ''}
          </div>
        `}
      </div>

      <!-- Decide modal -->
      ${decideModal && html`
        <${DecideModal}
          approval=${decideModal.approval}
          action=${decideModal.action}
          onClose=${() => setDecideModal(null)}
          onDone=${() => { setDecideModal(null); load(); }}
        />
      `}
    </>
  `;
}
