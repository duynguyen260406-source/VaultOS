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
  const canManageFlags = ['manager', 'auditor'].includes(user?.role);
  const [screening, setScreening] = useState(false);

  const [customer, setCustomer] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [types, setTypes] = useState([]);
  const [branches, setBranches] = useState([]);
  const [oaType, setOaType] = useState('');
  const [oaBranch, setOaBranch] = useState('');
  const [oaError, setOaError] = useState('');
  const [oaLoading, setOaLoading] = useState(false);

  const [flagModal, setFlagModal] = useState(false);
  const [flagForm, setFlagForm] = useState({ flag_type: 'VIP', reason: '', expires_at: '' });
  const [flagError, setFlagError] = useState('');
  const [flagSaving, setFlagSaving] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true); setError('');
    try {
      const [cust, accsRes, flagsRes] = await Promise.all([
        api.getCustomer(id),
        api.getCustomerAccounts(id),
        api.listCustomerFlags(id, { active_only: false }).catch(() => []),
      ]);
      setCustomer(cust);
      setAccounts(accsRes.accounts || []);
      setFlags(Array.isArray(flagsRes) ? flagsRes : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleAddFlag(e) {
    e.preventDefault();
    setFlagSaving(true); setFlagError('');
    try {
      await api.addCustomerFlag(id, {
        flag_type: flagForm.flag_type,
        reason: flagForm.reason || null,
        expires_at: flagForm.expires_at || null,
      });
      toast.success(`${flagForm.flag_type} flag added.`);
      setFlagModal(false);
      load();
    } catch (e) { setFlagError(e.message); }
    finally { setFlagSaving(false); }
  }

  async function handleScreen() {
    setScreening(true);
    try {
      const res = await api.screenCustomer(id);
      if (res.matches > 0) toast.error(`${res.matches} sanctions match(es) found! Review in Sanctions page.`);
      else toast.success('Screening complete: no matches found.');
    } catch (e) { toast.error(e.message); }
    finally { setScreening(false); }
  }

  async function handleRemoveFlag(flagId, flagType) {
    if (!confirm(`Remove ${flagType} flag?`)) return;
    try {
      await api.removeCustomerFlag(id, flagId);
      toast.success('Flag removed.');
      load();
    } catch (e) { toast.error(e.message); }
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
          <div style="display:flex;gap:6px;">
            ${canManageFlags && html`
              <button className="btn btn-secondary btn-sm" onClick=${handleScreen} disabled=${screening}>
                ${screening ? html`<${Spinner} />` : 'Screen Sanctions'}
              </button>
            `}
            ${canCreate && html`<button className="btn btn-primary btn-sm" onClick=${openAccountModal}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Open Account
            </button>`}
          </div>
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

        ${(() => {
          const blocking = flags.filter(f => f.is_active && ['Blacklist','CourtOrder','Incapacitated','Deceased'].includes(f.flag_type));
          const active = flags.filter(f => f.is_active);
          if (!active.length) return null;
          const isBlocked = blocking.length > 0;
          const color = isBlocked ? '#ef4444' : '#f59e0b';
          const bg = isBlocked ? 'rgba(239,68,68,.08)' : 'rgba(245,158,11,.08)';
          return html`
            <div style="padding:10px 14px;border-radius:8px;background:${bg};border:1px solid ${color}33;margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style="font-size:12px;font-weight:600;color:${color};">${isBlocked ? 'BLOCKED' : 'FLAGGED'}</span>
              <span style="font-size:12px;color:var(--foreground);">${active.map(f => f.flag_type).join(', ')}</span>
            </div>
          `;
        })()}

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
        <div className="tbl-wrap" style="margin-top:16px;">
          <div className="tbl-head">
            <span className="tbl-head-title">Flags (${flags.length})</span>
            ${canManageFlags && html`
              <button className="btn btn-secondary btn-sm"
                onClick=${() => { setFlagForm({ flag_type: 'VIP', reason: '', expires_at: '' }); setFlagError(''); setFlagModal(true); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Flag
              </button>
            `}
          </div>
          ${flags.length ? html`
            <table>
              <thead><tr><th>Type</th><th>Reason</th><th>Added</th><th>Expires</th><th>Status</th>${canManageFlags ? html`<th></th>` : null}</tr></thead>
              <tbody>${flags.map(f => html`
                <tr key=${f.flag_id}>
                  <td><span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;background:${
                    f.flag_type === 'VIP' ? 'rgba(250,204,21,.15)' :
                    f.flag_type === 'Blacklist' ? 'rgba(239,68,68,.15)' :
                    'rgba(100,116,139,.15)'
                  };color:${
                    f.flag_type === 'VIP' ? '#ca8a04' :
                    f.flag_type === 'Blacklist' ? '#ef4444' :
                    'var(--muted-foreground)'
                  };">${f.flag_type}</span></td>
                  <td style="font-size:12px;color:var(--body-muted);">${f.reason || '—'}</td>
                  <td style="font-size:12px;color:var(--body-muted);">${fmt.date(f.added_at)}</td>
                  <td style="font-size:12px;color:var(--body-muted);">${f.expires_at ? fmt.date(f.expires_at) : '—'}</td>
                  <td><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${f.is_active ? 'rgba(122,223,46,.15)' : 'rgba(100,116,139,.1)'};color:${f.is_active ? '#7adf2e' : 'var(--muted-foreground)'};">${f.is_active ? 'Active' : 'Removed'}</span></td>
                  ${canManageFlags ? html`<td>${f.is_active ? html`<button className="btn btn-ghost btn-sm" onClick=${() => handleRemoveFlag(f.flag_id, f.flag_type)} style="color:#ef4444;">Remove</button>` : null}</td>` : null}
                </tr>
              `)}</tbody>
            </table>
          ` : html`
            <div className="empty-state" style="padding:24px 0;">
              <div className="empty-state-title">No flags</div>
              <div className="empty-state-text">No flags on this customer.</div>
            </div>
          `}
        </div>
      </div>

      <${Modal}
        open=${flagModal}
        onClose=${() => setFlagModal(false)}
        title="Add Customer Flag"
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => setFlagModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick=${handleAddFlag} disabled=${flagSaving}>
            ${flagSaving ? html`<${Spinner} />` : 'Add Flag'}
          </button>
        `}
      >
        <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;">
          <div className="form-group" style="margin:0;">
            <label className="form-label">Flag type <span className="form-req">*</span></label>
            <select className="form-input" value=${flagForm.flag_type}
              onChange=${e => setFlagForm(p => ({ ...p, flag_type: e.target.value }))}>
              ${['VIP','Blacklist','UnderInvestigation','PEP','Deceased','Incapacitated','CourtOrder']
                .map(t => html`<option key=${t} value=${t}>${t}</option>`)}
            </select>
          </div>
          <div className="form-group" style="margin:0;">
            <label className="form-label">Reason</label>
            <input className="form-input" value=${flagForm.reason}
              onChange=${e => setFlagForm(p => ({ ...p, reason: e.target.value }))}
              placeholder="Reason or notes" />
          </div>
          <div className="form-group" style="margin:0;">
            <label className="form-label">Expires (optional)</label>
            <input type="date" className="form-input" value=${flagForm.expires_at}
              onChange=${e => setFlagForm(p => ({ ...p, expires_at: e.target.value }))} />
          </div>
          ${flagError && html`<div className="alert alert-danger">${flagError}</div>`}
        </div>
      <//>

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


