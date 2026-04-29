import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import Modal from '../components/Modal.js';
import { Spinner, StatusBadge } from '../components/Spinner.js';

export default function CustomerDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canCreate = ['manager', 'teller'].includes(user?.role);

  const [customer, setCustomer] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [types, setTypes] = useState([]);
  const [branches, setBranches] = useState([]);
  const [oaType, setOaType] = useState('');
  const [oaBranch, setOaBranch] = useState('');
  const [oaError, setOaError] = useState('');
  const [oaLoading, setOaLoading] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true); setError('');
    try {
      const [cust, accsRes] = await Promise.all([api.getCustomer(id), api.getCustomerAccounts(id)]);
      setCustomer(cust);
      setAccounts(accsRes.accounts || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function openAccountModal() {
    setModalOpen(true); setOaError('');
    try {
      const [typesRes, branchesRes] = await Promise.all([api.listAccountTypes(), api.listBranches()]);
      const t = Array.isArray(typesRes) ? typesRes : typesRes.account_types || [];
      const b = Array.isArray(branchesRes) ? branchesRes : branchesRes.branches || [];
      setTypes(t);
      setBranches(b);
      if (t.length) setOaType(String(t[0].account_type_id));
      if (b.length) setOaBranch(String(b[0].branch_id));
    } catch (e) { setOaError('Failed to load options: ' + e.message); }
  }

  async function handleOpenAccount(e) {
    e.preventDefault();
    if (!oaType || !oaBranch) { setOaError('Please select type and branch.'); return; }
    setOaLoading(true); setOaError('');
    try {
      const res = await api.openAccount({ customer_id: parseInt(id), account_type_id: parseInt(oaType), branch_id: parseInt(oaBranch) });
      toast.success(`Account ${res.account_number} opened.`);
      setModalOpen(false);
      navigate('/accounts/' + res.account_id);
    } catch (e) { setOaError(e.message); }
    finally { setOaLoading(false); }
  }

  if (loading) return html`
    <>
      <header className="topbar"><span className="topbar-title">Customer</span></header>
      <div className="page"><div className="empty-state"><${Spinner} large /></div></div>
    </>
  `;

  if (error) return html`
    <>
      <header className="topbar"><${Link} to="/customers" className="btn btn-ghost btn-sm">← Back<//>
      </header>
      <div className="page"><div className="alert alert-danger">${error}</div></div>
    </>
  `;

  return html`
    <>
      <header className="topbar">
        <div style="display:flex;align-items:center;gap:10px;">
          <${Link} to="/customers" className="btn btn-ghost btn-sm">← Back<//>
          <span style="color:var(--blue-12);">|</span>
          <span className="topbar-title">${customer?.first_name} ${customer?.last_name}</span>
        </div>
        <div className="topbar-right">
          ${canCreate && html`<button className="btn btn-primary btn-sm" onClick=${openAccountModal}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Open Account
          </button>`}
        </div>
      </header>

      <div className="page">
        <div className="card" style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
            <div style="width:44px;height:44px;border-radius:11px;background:var(--gradient-sub12);border:1px solid var(--blue-24);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--blue-90);">
              ${fmt.initials(customer?.first_name + ' ' + customer?.last_name)}
            </div>
            <div>
              <div style="font-size:16px;font-weight:600;letter-spacing:-.02em;">${customer?.first_name} ${customer?.last_name}</div>
              <div style="font-size:12px;color:var(--body-muted);margin-top:2px;">Customer #${customer?.customer_id}</div>
            </div>
          </div>
          <div className="detail-grid">
            ${[
              ['Email', customer?.email], ['Phone', customer?.phone],
              ['Date of birth', fmt.date(customer?.date_of_birth)], ['Gender', customer?.gender],
              ['City', customer?.city], ['Address', customer?.address],
              ['Registered', fmt.date(customer?.created_at)],
            ].map(([label, val]) => html`
              <div key=${label} className="detail-item">
                <span className="detail-lbl">${label}</span>
                <span className="detail-val">${val || '-'}</span>
              </div>
            `)}
          </div>
        </div>

        <div className="tbl-wrap">
          <div className="tbl-head">
            <span className="tbl-head-title">Accounts (${accounts?.length || 0})</span>
            ${canCreate && html`<button className="btn btn-secondary btn-sm" onClick=${openAccountModal}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Open Account
            </button>`}
          </div>
          ${accounts?.length ? html`
            <table>
              <thead><tr><th>Account #</th><th>Type</th><th>Branch</th><th>Balance</th><th>Status</th><th></th></tr></thead>
              <tbody>${accounts.map(a => html`
                <tr key=${a.account_id} className="clickable" onClick=${() => navigate('/accounts/' + a.account_id)}>
                  <td style="font-family:monospace;font-size:12px;">${a.account_number}</td>
                  <td>${a.account_type}</td>
                  <td>${a.branch_name}</td>
                  <td style="color:var(--blue-90);font-weight:500;">${fmt.currency(a.balance)}</td>
                  <td><${StatusBadge} status=${a.status} /></td>
                  <td><${Link} to=${'/accounts/' + a.account_id} className="btn btn-ghost btn-sm" onClick=${e => e.stopPropagation()}>View<//>
                  </td>
                </tr>
              `)}</tbody>
            </table>
          ` : html`
            <div className="empty-state">
              <div className="empty-icon-wrap"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div>
              <div className="empty-state-title">No accounts</div>
              <div className="empty-state-text">This customer doesn't have any accounts yet.</div>
              ${canCreate && html`<button className="btn btn-primary btn-sm" style="margin-top:6px;" onClick=${openAccountModal}>Open first account</button>`}
            </div>
          `}
        </div>
      </div>

      <${Modal}
        open=${modalOpen}
        onClose=${() => setModalOpen(false)}
        title="Open New Account"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick=${handleOpenAccount} disabled=${oaLoading}>
            ${oaLoading ? html`<${Spinner} />` : 'Open account'}
          </button>
        `}
      >
        <div className="form-group">
          <label className="form-label">Account type <span className="form-req">*</span></label>
          <select className="form-select" value=${oaType} onChange=${e => setOaType(e.target.value)}>
            ${types.map(t => html`<option key=${t.account_type_id} value=${t.account_type_id}>${t.type_name}</option>`)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Branch <span className="form-req">*</span></label>
          <select className="form-select" value=${oaBranch} onChange=${e => setOaBranch(e.target.value)}>
            ${branches.map(b => html`<option key=${b.branch_id} value=${b.branch_id}>${b.branch_name}</option>`)}
          </select>
        </div>
        ${oaError && html`<div className="alert alert-danger">${oaError}</div>`}
      <//>
    </>
  `;
}


