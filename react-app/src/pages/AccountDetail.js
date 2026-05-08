import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import Modal from '../components/Modal.js';
import { Spinner, StatusBadge, TxBadge } from '../components/Spinner.js';

export default function AccountDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isManager = user?.role === 'manager';
  const canTransact = ['manager', 'teller'].includes(user?.role);

  const [account, setAccount] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closeModal, setCloseModal] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closing, setClosing] = useState(false);
  const [stmtModal, setStmtModal] = useState(false);
  const [stmtFrom, setStmtFrom] = useState('');
  const [stmtTo, setStmtTo] = useState('');
  const [statusModal, setStatusModal] = useState(false);
  const [statusForm, setStatusForm] = useState({ new_status: '', reason: '', hold_expires_at: '' });
  const [statusError, setStatusError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusHistory, setStatusHistory] = useState([]);
  const canChangeStatus = ['manager', 'auditor'].includes(user?.role);
  const [pitDate, setPitDate] = useState('');
  const [pitBalance, setPitBalance] = useState(null);
  const [pitLoading, setPitLoading] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true); setError('');
    try {
      const [acc, txRes, hist] = await Promise.all([
        api.getAccount(id),
        api.getTransactions(id, { limit: 50 }),
        api.getStatusHistory(id).catch(() => []),
      ]);
      setAccount(acc);
      setTxs(txRes.transactions || []);
      setStatusHistory(hist || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handlePitLookup() {
    if (!pitDate) return;
    setPitLoading(true); setPitBalance(null);
    try {
      const res = await api.accountBalanceAt({ account_id: id, at: pitDate });
      setPitBalance(res);
    } catch (e) { toast.error(e.message); }
    finally { setPitLoading(false); }
  }

  async function handleStatusChange(e) {
    e.preventDefault();
    if (!statusForm.new_status) { setStatusError('Please select a new status.'); return; }
    setStatusSaving(true); setStatusError('');
    try {
      await api.changeAccountStatus(id, {
        new_status: statusForm.new_status,
        reason: statusForm.reason || null,
        hold_expires_at: statusForm.hold_expires_at || null,
      });
      toast.success(`Account status changed to ${statusForm.new_status}.`);
      setStatusModal(false);
      load();
    } catch (e) { setStatusError(e.message); }
    finally { setStatusSaving(false); }
  }

  async function handleClose(e) {
    e.preventDefault();
    setClosing(true); setCloseError('');
    try {
      await api.closeAccount(id);
      toast.success('Account closed successfully.');
      setCloseModal(false);
      load();
    } catch (e) { setCloseError(e.message); }
    finally { setClosing(false); }
  }

  if (loading) return html`
    <>
      <header className="topbar"><span className="topbar-title">Account</span></header>
      <div className="page"><div className="empty-state"><${Spinner} large /></div></div>
    </>
  `;

  if (error) return html`
    <>
      <header className="topbar">
        <button className="btn btn-ghost btn-sm" onClick=${() => navigate(-1)}>← Back</button>
      </header>
      <div className="page"><div className="alert alert-danger">${error}</div></div>
    </>
  `;

  const isActive = account?.status === 'Active';
  const balanceColor = account?.balance > 0 ? '#7adf2e' : account?.balance < 0 ? '#ef4444' : '';

  return html`
    <>
      <header className="topbar">
        <div style="display:flex;align-items:center;gap:10px;">
          <button className="btn btn-ghost btn-sm" onClick=${() => navigate(-1)}>← Back</button>
          <span style="color:var(--blue-12);">|</span>
          <span className="topbar-title" style="font-family:monospace;">${account?.account_number}</span>
        </div>
        <div className="topbar-right" style="display:flex;gap:8px;">
          <button className="btn btn-secondary btn-sm" onClick=${() => setStmtModal(true)}
            style="display:inline-flex;align-items:center;gap:5px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Statement
          </button>
          ${canChangeStatus && account?.status !== 'Closed' && html`
            <button className="btn btn-secondary btn-sm" onClick=${() => { setStatusForm({ new_status: '', reason: '', hold_expires_at: '' }); setStatusError(''); setStatusModal(true); }}
              style="display:inline-flex;align-items:center;gap:5px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Change Status
            </button>
          `}
          ${(canTransact && isActive) ? html`
            <${Link} to=${'/transactions?account_id=' + id + '&type=deposit'} className="btn btn-green btn-sm">Deposit<//>
            <${Link} to=${'/transactions?account_id=' + id + '&type=withdraw'} className="btn btn-secondary btn-sm">Withdraw<//>
            <${Link} to=${'/transactions?account_id=' + id + '&type=transfer'} className="btn btn-secondary btn-sm">Transfer<//>
            ${(isManager && isActive) ? html`<button className="btn btn-danger btn-sm" onClick=${() => setCloseModal(true)}>Close Account</button>` : null}
          ` : (isManager && isActive) ? html`<button className="btn btn-danger btn-sm" onClick=${() => setCloseModal(true)}>Close Account</button>` : null}
        </div>
      </header>

      <div className="page">
        <div className="card" style="margin-bottom:16px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:18px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:44px;height:44px;border-radius:11px;background:var(--blue-12);border:1px solid var(--blue-24);display:flex;align-items:center;justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bad6f7" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              </div>
              <div>
                <div style="font-size:15px;font-weight:600;letter-spacing:-.02em;font-family:monospace;">${account?.account_number}</div>
                <div style="font-size:12px;color:var(--body-muted);margin-top:2px;">${account?.account_type} - ${account?.branch_name}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:24px;font-weight:700;letter-spacing:-.02em;${balanceColor ? `color:${balanceColor}` : ''}">${fmt.currency(account?.balance)}</div>
              <div style="margin-top:4px;"><${StatusBadge} status=${account?.status} /></div>
            </div>
          </div>
          <div className="detail-grid">
            ${[
              ['Account ID', '#' + account?.account_id],
              ['Customer', html`<${Link} to=${'/customers/' + account?.customer_id} style="color:var(--blue-90);">${account?.customer_name}<//>` ],
              ['Account type', account?.account_type],
              ['Branch', account?.branch_name],
              ['Opened', fmt.date(account?.created_at)],
              ['Balance', html`<span style="${balanceColor ? `color:${balanceColor};` : ''}font-weight:600;">${fmt.currency(account?.balance)}</span>`],
            ].map(([label, val]) => html`
              <div key=${label} className="detail-item">
                <span className="detail-lbl">${label}</span>
                <span className="detail-val">${val}</span>
              </div>
            `)}
          </div>

          ${['manager','auditor'].includes(user?.role) && html`
            <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <span style="font-size:12px;font-weight:600;color:var(--muted-foreground);">Balance as of date:</span>
              <input type="date" className="form-input" style="width:160px;font-size:12px;height:28px;padding:0 8px;"
                value=${pitDate} onChange=${e => setPitDate(e.target.value)} max=${new Date().toISOString().slice(0,10)} />
              <button className="btn btn-secondary btn-sm" onClick=${handlePitLookup} disabled=${pitLoading || !pitDate}>
                ${pitLoading ? html`<${Spinner} />` : 'Look up'}
              </button>
              ${pitBalance && html`
                <span style="font-size:13px;font-weight:600;color:var(--blue-90);">
                  ${fmt.currency(pitBalance.balance)}
                  <span style="font-size:11px;color:var(--muted-foreground);font-weight:400;margin-left:4px;">(${pitBalance.method})</span>
                </span>
              `}
            </div>
          `}
        </div>

        <div className="tbl-wrap">
          <div className="tbl-head">
            <span className="tbl-head-title">Transaction history (${txs.length})</span>
            ${canTransact && isActive && html`
              <${Link} to=${'/transactions?account_id=' + id + '&type=deposit'} className="btn btn-secondary btn-sm">New transaction<//>
            `}
          </div>
          ${txs.length ? html`
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th><th>Ref</th></tr></thead>
              <tbody>${txs.map(t => {
                const isCredit = ['deposit','credit'].includes(t.transaction_type?.toLowerCase());
                return html`
                  <tr key=${t.transaction_id || t.reference_id}>
                    <td style="font-size:12px;color:var(--body-muted);">${fmt.datetime(t.transaction_date)}</td>
                    <td><${TxBadge} type=${t.transaction_type} /></td>
                    <td className=${isCredit ? 'amount-pos' : 'amount-neg'} style="font-weight:600;">${isCredit ? '+' : '-'}${fmt.currency(t.amount)}</td>
                    <td style="font-size:12px;color:var(--body-muted);">${t.description || '-'}</td>
                    <td style="font-size:11px;color:var(--body-muted);font-family:monospace;">${t.reference_id || '-'}</td>
                  </tr>
                `;
              })}</tbody>
            </table>
          ` : html`
            <div className="empty-state">
              <div className="empty-icon-wrap"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
              <div className="empty-state-title">No transactions</div>
              <div className="empty-state-text">No transactions recorded for this account yet.</div>
            </div>
          `}
        </div>

        ${statusHistory.length > 0 && html`
          <div className="tbl-wrap" style="margin-top:16px;">
            <div className="tbl-head"><span className="tbl-head-title">Status history</span></div>
            <table>
              <thead><tr><th>Date</th><th>Old Status</th><th>New Status</th><th>Reason</th><th>Changed by</th></tr></thead>
              <tbody>${statusHistory.map(h => html`
                <tr key=${h.history_id}>
                  <td style="font-size:12px;color:var(--body-muted);">${fmt.datetime(h.changed_at)}</td>
                  <td><${StatusBadge} status=${h.old_status || '—'} /></td>
                  <td><${StatusBadge} status=${h.new_status} /></td>
                  <td style="font-size:12px;color:var(--body-muted);">${h.reason || '—'}</td>
                  <td style="font-size:12px;">${h.changed_by_username || '—'}</td>
                </tr>
              `)}</tbody>
            </table>
          </div>
        `}
      </div>

      <${Modal}
        open=${statusModal}
        onClose=${() => setStatusModal(false)}
        title="Change Account Status"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setStatusModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick=${handleStatusChange} disabled=${statusSaving}>
            ${statusSaving ? html`<${Spinner} />` : 'Save'}
          </button>
        `}
      >
        <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;">
          <div className="form-group" style="margin:0;">
            <label className="form-label">New status</label>
            <select className="form-input" value=${statusForm.new_status}
              onChange=${e => setStatusForm(p => ({ ...p, new_status: e.target.value }))}>
              <option value="">— select —</option>
              ${user?.role === 'auditor'
                ? html`<option value="Frozen">Frozen</option>`
                : html`
                  <option value="Active">Active</option>
                  <option value="Hold">Hold</option>
                  <option value="Frozen">Frozen</option>
                  <option value="Dormant">Dormant</option>
                `}
            </select>
          </div>
          <div className="form-group" style="margin:0;">
            <label className="form-label">Reason</label>
            <input className="form-input" value=${statusForm.reason}
              onChange=${e => setStatusForm(p => ({ ...p, reason: e.target.value }))}
              placeholder="Reason for status change" />
          </div>
          ${statusForm.new_status === 'Hold' && html`
            <div className="form-group" style="margin:0;">
              <label className="form-label">Hold expires (optional)</label>
              <input type="date" className="form-input" value=${statusForm.hold_expires_at}
                onChange=${e => setStatusForm(p => ({ ...p, hold_expires_at: e.target.value }))} />
            </div>
          `}
          ${statusError && html`<div className="alert alert-danger">${statusError}</div>`}
        </div>
      <//>

      <${Modal}
        open=${stmtModal}
        onClose=${() => setStmtModal(false)}
        title="Download Statement"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setStmtModal(false)}>Cancel</button>
          <a
            href=${api.accountStatementUrl(id, { from: stmtFrom, to: stmtTo })}
            target="_blank"
            rel="noopener"
            className="btn btn-primary"
            onClick=${() => setStmtModal(false)}
          >Download PDF</a>
        `}
      >
        <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;">
          <p style="margin:0;color:var(--muted-foreground);">Select a date range for the statement. Leave blank to include all transactions.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div className="form-group" style="margin:0;">
              <label className="form-label">From date</label>
              <input type="date" className="form-input" value=${stmtFrom} onChange=${e => setStmtFrom(e.target.value)} />
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">To date</label>
              <input type="date" className="form-input" value=${stmtTo} onChange=${e => setStmtTo(e.target.value)} />
            </div>
          </div>
        </div>
      <//>

      <${Modal}
        open=${closeModal}
        onClose=${() => setCloseModal(false)}
        title="Close Account"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setCloseModal(false)}>Cancel</button>
          <button className="btn btn-danger" onClick=${handleClose} disabled=${closing}>
            ${closing ? html`<${Spinner} />` : 'Close account'}
          </button>
        `}
      >
        <div className="alert alert-warning">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style="flex-shrink:0;margin-top:1px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div>This will permanently close the account. Balance must be zero. This action cannot be undone.</div>
        </div>
        ${closeError && html`<div className="alert alert-danger">${closeError}</div>`}
      <//>
    </>
  `;
}


