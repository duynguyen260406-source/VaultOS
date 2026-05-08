import { html } from '../lib/html.js';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import Modal from '../components/Modal.js';
import { Spinner } from '../components/Spinner.js';

const STATUS_META = {
  open:        { color: '#22c55e', bg: 'rgba(34,197,94,.1)',   border: 'rgba(34,197,94,.2)',   label: 'Open' },
  closed:      { color: '#60a5fa', bg: 'rgba(96,165,250,.1)',  border: 'rgba(96,165,250,.2)',  label: 'Closed' },
  reconciled:  { color: '#a78bfa', bg: 'rgba(167,139,250,.1)', border: 'rgba(167,139,250,.2)', label: 'Reconciled' },
  flagged:     { color: '#f59e0b', bg: 'rgba(245,158,11,.1)',  border: 'rgba(245,158,11,.2)',  label: 'Flagged — variance' },
};

function SessionPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.closed;
  return html`
    <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11.5px;font-weight:600;background:${m.bg};border:1px solid ${m.border};color:${m.color};">
      <span style="width:6px;height:6px;border-radius:50%;background:${m.color};flex-shrink:0;${status==='open'?'box-shadow:0 0 0 3px rgba(34,197,94,.25);':''}" />
      ${m.label}
    </span>
  `;
}

function CashLine({ label, value, accent, large }) {
  return html`
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:${large?'10px':'7px'} 0;border-bottom:1px solid var(--border);">
      <span style="font-size:${large?'13px':'12px'};color:var(--muted-foreground);">${label}</span>
      <span style="font-size:${large?'16px':'13px'};font-weight:${large?700:600};color:${accent||'var(--foreground)'};">${value}</span>
    </div>
  `;
}

export default function EndOfDay() {
  const { user } = useAuth();
  const toast = useToast();
  const isManager = user?.role === 'manager';
  const isTeller  = user?.role === 'teller';

  const [session, setSession]         = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessions, setSessions]       = useState([]);
  const [listLoading, setListLoading] = useState(true);

  const [openModal, setOpenModal]     = useState(false);
  const [closeModal, setCloseModal]   = useState(false);
  const [reconcileModal, setReconcileModal] = useState(null);

  const [openingBalance, setOpeningBalance] = useState('');
  const [countedAmount, setCountedAmount]   = useState('');
  const [notes, setNotes]                   = useState('');
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [formError, setFormError]           = useState('');

  const loadSession = useCallback(async () => {
    if (!isTeller && !isManager) return;
    setSessionLoading(true);
    try {
      const s = await api.getMySession();
      setSession(s);
    } catch { setSession(null); }
    finally { setSessionLoading(false); }
  }, [isTeller, isManager]);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await api.listSessions({ limit: 50 });
      setSessions(res.sessions || []);
    } catch {}
    finally { setListLoading(false); }
  }, []);

  useEffect(() => { loadSession(); loadList(); }, []);

  async function handleOpen(e) {
    e.preventDefault(); setFormError(''); setSubmitting(true);
    try {
      const s = await api.openSession({ opening_balance: parseFloat(openingBalance) || 0 });
      setSession(s); setOpenModal(false); setOpeningBalance('');
      toast.success('Session opened.');
      loadList();
    } catch (err) { setFormError(err.message); }
    finally { setSubmitting(false); }
  }

  async function handleClose(e) {
    e.preventDefault(); setFormError(''); setSubmitting(true);
    try {
      const s = await api.closeSession({ counted_amount: parseFloat(countedAmount) || 0, notes });
      setSession(s); setCloseModal(false); setCountedAmount(''); setNotes('');
      if (s.status === 'flagged') {
        toast.error(`Session flagged — variance: ${fmt.currency(s.variance)}`);
      } else {
        toast.success('Session closed.');
      }
      loadList();
    } catch (err) { setFormError(err.message); }
    finally { setSubmitting(false); }
  }

  async function handleReconcile(e) {
    e.preventDefault(); setFormError(''); setSubmitting(true);
    try {
      await api.reconcileSession(reconcileModal.session_id, { notes: reconcileNotes });
      setReconcileModal(null); setReconcileNotes('');
      toast.success('Session reconciled.');
      loadList();
      if (session && session.session_id === reconcileModal.session_id) loadSession();
    } catch (err) { setFormError(err.message); }
    finally { setSubmitting(false); }
  }

  const openSessions = sessions.filter(s => s.status === 'open' || s.status === 'flagged');

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">End of Day</span>
        ${(isTeller || isManager) && !session && html`
          <div className="topbar-right">
            <button className="btn btn-primary btn-sm" onClick=${() => { setOpenModal(true); setFormError(''); }}>
              Open session
            </button>
          </div>
        `}
      </header>

      <div className="page">

        ${/* --- TELLER / MANAGER: own session card --- */''}
        ${(isTeller || isManager) && html`
          <div className="card" style="margin-bottom:20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border);">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;border-radius:9px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.15);display:flex;align-items:center;justify-content:center;">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.6"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                </div>
                <div>
                  <div style="font-size:14px;font-weight:600;letter-spacing:-.01em;">My Cash Drawer</div>
                  <div style="font-size:12px;color:var(--muted-foreground);margin-top:1px;">${user?.username} · ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</div>
                </div>
              </div>
              ${sessionLoading
                ? html`<${Spinner} />`
                : session
                  ? html`
                    <div style="display:flex;align-items:center;gap:8px;">
                      <${SessionPill} status=${session.status} />
                      ${(session.status === 'open') && html`
                        <button className="btn btn-secondary btn-sm" onClick=${() => { setCloseModal(true); setFormError(''); }}>
                          Close session
                        </button>
                      `}
                    </div>
                  `
                  : html`<span style="font-size:12px;color:var(--muted-foreground);">No open session</span>`
              }
            </div>

            ${session ? html`
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;">
                <div>
                  <${CashLine} label="Opening balance" value=${fmt.currency(session.opening_balance)} />
                  <${CashLine} label="Running cash movement" value=${fmt.currency(session.running_cash ?? 0)} accent=${session.running_cash >= 0 ? '#22c55e' : '#ef4444'} />
                  <${CashLine} label="Expected closing" value=${fmt.currency((session.opening_balance || 0) + (session.running_cash || 0))} large />
                </div>
                ${(session.closing_balance_counted !== null && session.closing_balance_counted !== undefined) && html`
                  <div>
                    <${CashLine} label="Counted amount" value=${fmt.currency(session.closing_balance_counted)} />
                    <${CashLine} label="Variance" value=${fmt.currency(session.variance)}
                      accent=${Math.abs(session.variance||0) > 0 ? '#f59e0b' : '#22c55e'} large />
                    ${session.notes && html`<div style="font-size:12px;color:var(--muted-foreground);margin-top:8px;">${session.notes}</div>`}
                  </div>
                `}
              </div>
              <div style="margin-top:10px;font-size:12px;color:var(--muted-foreground);">
                Opened: ${fmt.datetime(session.opened_at)}
                ${session.closed_at ? html` · Closed: ${fmt.datetime(session.closed_at)}` : null}
              </div>
            ` : html`
              <div style="text-align:center;padding:24px 0;color:var(--muted-foreground);font-size:13px;">
                Start your shift by opening a new session.
              </div>
            `}
          </div>
        `}

        ${/* --- Manager: unclosed sessions alert --- */''}
        ${isManager && openSessions.length > 0 && html`
          <div style="margin-bottom:20px;padding:12px 16px;background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);border-radius:11px;display:flex;align-items:center;gap:10px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" style="flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span style="font-size:13px;color:#f59e0b;font-weight:500;">${openSessions.length} unclosed session${openSessions.length !== 1 ? 's' : ''} require attention.</span>
          </div>
        `}

        ${/* --- Session history table --- */''}
        <div className="tbl-wrap">
          <div className="tbl-head">
            <span className="tbl-head-title">Session history</span>
          </div>
          ${listLoading
            ? html`<div style="padding:40px;text-align:center;"><${Spinner} large /></div>`
            : sessions.length
              ? html`
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Teller</th>
                      <th>Branch</th>
                      <th>Opened</th>
                      <th>Opening</th>
                      <th>Expected</th>
                      <th>Counted</th>
                      <th>Variance</th>
                      <th>Status</th>
                      ${isManager ? html`<th></th>` : null}
                    </tr>
                  </thead>
                  <tbody>
                    ${sessions.map(s => {
                      const hasVariance = s.variance !== null && s.variance !== undefined;
                      return html`
                        <tr key=${s.session_id}>
                          <td style="font-size:12px;color:var(--muted-foreground);font-family:monospace;">#${s.session_id}</td>
                          <td style="font-size:13px;font-weight:500;">${s.username}</td>
                          <td style="font-size:12px;color:var(--muted-foreground);">${s.branch_name}</td>
                          <td style="font-size:12px;color:var(--muted-foreground);">${fmt.datetime(s.opened_at)}</td>
                          <td style="font-size:13px;">${fmt.currency(s.opening_balance)}</td>
                          <td style="font-size:13px;">${s.closing_balance_expected != null ? fmt.currency(s.closing_balance_expected) : '—'}</td>
                          <td style="font-size:13px;">${s.closing_balance_counted != null ? fmt.currency(s.closing_balance_counted) : '—'}</td>
                          <td style="font-size:13px;font-weight:600;color:${hasVariance && Math.abs(s.variance) > 0 ? '#f59e0b' : 'var(--muted-foreground)'};">
                            ${hasVariance ? fmt.currency(s.variance) : '—'}
                          </td>
                          <td><${SessionPill} status=${s.status} /></td>
                          ${isManager ? html`
                            <td>
                              ${(s.status === 'closed' || s.status === 'flagged') && html`
                                <button className="btn btn-secondary btn-sm"
                                  onClick=${() => { setReconcileModal(s); setReconcileNotes(''); setFormError(''); }}>
                                  Reconcile
                                </button>
                              `}
                            </td>
                          ` : null}
                        </tr>
                      `;
                    })}
                  </tbody>
                </table>
              `
              : html`
                <div className="empty-state">
                  <div className="empty-icon-wrap">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                  </div>
                  <div className="empty-state-title">No sessions yet</div>
                  <div className="empty-state-text">Open a session at the start of your shift.</div>
                </div>
              `
          }
        </div>
      </div>

      ${/* --- Open session modal --- */''}
      <${Modal} open=${openModal} onClose=${() => setOpenModal(false)} title="Open Session"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setOpenModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick=${handleOpen} disabled=${submitting}>
            ${submitting ? html`<${Spinner} />` : 'Open session'}
          </button>
        `}
      >
        <form onSubmit=${handleOpen} style="display:flex;flex-direction:column;gap:14px;">
          <div className="form-group" style="margin:0;">
            <label className="form-label">Opening cash balance (VND)</label>
            <input type="number" className="form-input" placeholder="0"
              value=${openingBalance} min="0"
              onChange=${e => setOpeningBalance(e.target.value)} />
            <div style="font-size:11.5px;color:var(--muted-foreground);margin-top:5px;">Enter the physical cash in your drawer at session start.</div>
          </div>
          ${formError && html`<div className="alert alert-danger" style="font-size:12.5px;">${formError}</div>`}
        </form>
      <//>

      ${/* --- Close session modal --- */''}
      <${Modal} open=${closeModal} onClose=${() => setCloseModal(false)} title="Close Session"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setCloseModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick=${handleClose} disabled=${submitting || !countedAmount}>
            ${submitting ? html`<${Spinner} />` : 'Close session'}
          </button>
        `}
      >
        <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;">
          ${session && html`
            <div style="padding:12px;background:var(--muted);border-radius:8px;font-size:12.5px;">
              Expected closing balance: <strong style="color:var(--foreground);">${fmt.currency((session.opening_balance||0) + (session.running_cash||0))}</strong>
            </div>
          `}
          <div className="form-group" style="margin:0;">
            <label className="form-label">Counted cash (VND) <span className="form-req">*</span></label>
            <input type="number" className="form-input" placeholder="0"
              value=${countedAmount} min="0"
              onChange=${e => setCountedAmount(e.target.value)} />
          </div>
          <div className="form-group" style="margin:0;">
            <label className="form-label">Notes (optional)</label>
            <textarea className="form-input" rows="2" placeholder="Any discrepancy notes..."
              value=${notes} onChange=${e => setNotes(e.target.value)}
              style="resize:vertical;min-height:60px;" />
          </div>
          ${formError && html`<div className="alert alert-danger" style="font-size:12.5px;">${formError}</div>`}
        </div>
      <//>

      ${/* --- Reconcile modal --- */''}
      <${Modal} open=${!!reconcileModal} onClose=${() => setReconcileModal(null)} title="Reconcile Session"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setReconcileModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick=${handleReconcile} disabled=${submitting}>
            ${submitting ? html`<${Spinner} />` : 'Mark reconciled'}
          </button>
        `}
      >
        <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;">
          ${reconcileModal && html`
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              ${[
                ['Teller', reconcileModal.username],
                ['Branch', reconcileModal.branch_name],
                ['Expected', fmt.currency(reconcileModal.closing_balance_expected)],
                ['Counted',  fmt.currency(reconcileModal.closing_balance_counted)],
                ['Variance', fmt.currency(reconcileModal.variance)],
                ['Status',   reconcileModal.status],
              ].map(([l, v]) => html`
                <div key=${l} style="padding:7px 10px;background:var(--muted);border-radius:6px;">
                  <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted-foreground);margin-bottom:2px;">${l}</div>
                  <div style="font-size:13px;font-weight:600;">${v}</div>
                </div>
              `)}
            </div>
          `}
          <div className="form-group" style="margin:0;">
            <label className="form-label">Reconciliation notes (optional)</label>
            <textarea className="form-input" rows="2" placeholder="Manager sign-off notes..."
              value=${reconcileNotes} onChange=${e => setReconcileNotes(e.target.value)}
              style="resize:vertical;min-height:56px;" />
          </div>
          ${formError && html`<div className="alert alert-danger" style="font-size:12.5px;">${formError}</div>`}
        </div>
      <//>
    </>
  `;
}
