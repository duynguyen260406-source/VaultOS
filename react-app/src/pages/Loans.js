import { html } from '../lib/html.js';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import Modal from '../components/Modal.js';
import { Spinner } from '../components/Spinner.js';

const STATUS_META = {
  Pending:     { color: '#f59e0b', bg: 'rgba(245,158,11,.1)',  border: 'rgba(245,158,11,.2)'  },
  Approved:    { color: '#22c55e', bg: 'rgba(34,197,94,.1)',   border: 'rgba(34,197,94,.2)'   },
  Rejected:    { color: '#ef4444', bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.2)'   },
  Disbursed:   { color: '#60a5fa', bg: 'rgba(96,165,250,.1)',  border: 'rgba(96,165,250,.2)'  },
  InArrears:   { color: '#f97316', bg: 'rgba(249,115,22,.1)',  border: 'rgba(249,115,22,.2)'  },
  Paid:        { color: '#a78bfa', bg: 'rgba(167,139,250,.1)', border: 'rgba(167,139,250,.2)' },
  WrittenOff:  { color: '#737373', bg: 'rgba(115,115,115,.1)', border: 'rgba(115,115,115,.2)' },
};

function LoanPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.Pending;
  return html`
    <span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${m.bg};border:1px solid ${m.border};color:${m.color};">${status}</span>
  `;
}

function DetailRow({ label, value }) {
  return html`
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">
      <span style="color:var(--muted-foreground);">${label}</span>
      <strong style="color:var(--foreground);text-align:right;max-width:60%;">${value}</strong>
    </div>
  `;
}

export default function Loans() {
  const { user } = useAuth();
  const toast = useToast();
  const isManager = user?.role === 'manager';
  const isTeller  = user?.role === 'teller';

  const [loans, setLoans]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [detail, setDetail]       = useState(null);
  const [repayments, setRepayments] = useState([]);
  const [repLoading, setRepLoading] = useState(false);

  const [applyModal, setApplyModal]   = useState(false);
  const [decideModal, setDecideModal] = useState(null);
  const [repayModal, setRepayModal]   = useState(null);

  const [form, setForm]     = useState({});
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [branches, setBranches] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listLoans({ approval_status: statusFilter, limit: 100 });
      setLoans(res.loans || []); setTotal(res.total || 0);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(loan) {
    setDetail(loan);
    setRepLoading(true);
    try {
      const reps = await api.listRepayments(loan.loan_id);
      setRepayments(reps);
    } catch {}
    finally { setRepLoading(false); }
  }

  async function openApply() {
    setFormErr('');
    setForm({ customer_id: '', branch_id: user?.branch_id || '', linked_account_id: '', loan_amount: '', interest_rate: '', term_months: '', purpose: '', start_date: new Date().toISOString().slice(0,10) });
    try {
      const [bRes, cRes] = await Promise.all([api.listBranches(), api.listCustomers({ limit: 200 })]);
      setBranches(Array.isArray(bRes) ? bRes : bRes.branches || []);
      setCustomers(cRes.customers || []);
    } catch {}
    setApplyModal(true);
  }

  async function handleCustomerChange(cid) {
    setForm(f => ({ ...f, customer_id: cid, linked_account_id: '' }));
    if (!cid) { setAccounts([]); return; }
    try {
      const res = await api.getCustomerAccounts(cid);
      setAccounts((res.accounts || []).filter(a => a.status === 'Active' || a.status === 'active'));
    } catch { setAccounts([]); }
  }

  async function handleApply(e) {
    e.preventDefault(); setFormErr(''); setSaving(true);
    try {
      const d = {
        customer_id: parseInt(form.customer_id),
        branch_id: parseInt(form.branch_id),
        linked_account_id: parseInt(form.linked_account_id),
        loan_amount: parseFloat(form.loan_amount),
        interest_rate: parseFloat(form.interest_rate),
        term_months: parseInt(form.term_months),
        purpose: form.purpose || null,
        start_date: form.start_date,
      };
      if (!d.customer_id || !d.branch_id || !d.linked_account_id) throw new Error('Customer, branch and linked account are required.');
      if (!d.loan_amount || d.loan_amount <= 0) throw new Error('Loan amount must be greater than zero.');
      if (!d.interest_rate || d.interest_rate <= 0) throw new Error('Interest rate required.');
      if (!d.term_months || d.term_months <= 0) throw new Error('Term months required.');
      await api.applyLoan(d);
      toast.success('Loan application submitted.');
      setApplyModal(false); load();
    } catch (err) { setFormErr(err.message); }
    finally { setSaving(false); }
  }

  async function handleDecide(e) {
    e.preventDefault(); setFormErr(''); setSaving(true);
    try {
      const d = { decision: form.decision, rejection_reason: form.rejection_reason || null };
      if (!d.decision) throw new Error('Select a decision.');
      if (d.decision === 'Rejected' && !d.rejection_reason?.trim()) throw new Error('Rejection reason required.');
      const updated = await api.decideLoan(decideModal.loan_id, d);
      toast.success(`Loan ${d.decision}.`);
      setDecideModal(null);
      if (detail?.loan_id === updated.loan_id) setDetail(updated);
      load();
    } catch (err) { setFormErr(err.message); }
    finally { setSaving(false); }
  }

  async function handleDisburse(loan) {
    setSaving(true);
    try {
      const updated = await api.disburseLoan(loan.loan_id);
      toast.success('Loan disbursed.');
      if (detail?.loan_id === updated.loan_id) setDetail(updated);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleRepay(e) {
    e.preventDefault(); setFormErr(''); setSaving(true);
    try {
      await api.postRepayment(repayModal.loan_id, { amount: parseFloat(form.repay_amount) });
      toast.success('Repayment posted.');
      setRepayModal(null);
      const [updated, reps] = await Promise.all([
        api.getLoan(repayModal.loan_id),
        api.listRepayments(repayModal.loan_id),
      ]);
      setDetail(updated); setRepayments(reps);
      load();
    } catch (err) { setFormErr(err.message); }
    finally { setSaving(false); }
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const STATUS_TABS = ['', 'Pending', 'Approved', 'Disbursed', 'Paid', 'Rejected'];

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Loans</span>
        <div className="topbar-right">
          ${(isTeller || isManager) && html`
            <button className="btn btn-primary btn-sm" onClick=${openApply}>Apply for loan</button>
          `}
        </div>
      </header>

      <div className="page">
        <div className="tabs" style="margin-bottom:20px;">
          ${STATUS_TABS.map(s => html`
            <div key=${s||'all'} className=${'tab' + (statusFilter===s?' active':'')}
              onClick=${() => setStatusFilter(s)}>
              ${s || 'All'}
            </div>
          `)}
        </div>

        <div className="tbl-wrap">
          <div className="tbl-head">
            <span className="tbl-head-title">${total} loan${total!==1?'s':''}</span>
            <button className="btn btn-secondary btn-sm" onClick=${load}>Refresh</button>
          </div>
          ${loading
            ? html`<div style="padding:40px;text-align:center;"><${Spinner} large /></div>`
            : loans.length ? html`
              <table>
                <thead><tr><th>#</th><th>Customer</th><th>Branch</th><th>Amount</th><th>Rate</th><th>Term</th><th>Outstanding</th><th>Status</th><th></th></tr></thead>
                <tbody>${loans.map(l => html`
                  <tr key=${l.loan_id} style="cursor:pointer;" onClick=${() => openDetail(l)}>
                    <td style="font-size:11px;color:var(--muted-foreground);font-family:monospace;">#${l.loan_id}</td>
                    <td style="font-weight:500;">${l.customer_name}</td>
                    <td style="font-size:12px;color:var(--muted-foreground);">${l.branch_name}</td>
                    <td style="font-weight:600;">${fmt.currency(l.loan_amount)}</td>
                    <td style="font-size:12px;">${l.interest_rate}%</td>
                    <td style="font-size:12px;">${l.term_months ? l.term_months + ' mo' : '—'}</td>
                    <td style="font-size:13px;color:${l.principal_outstanding > 0 ? '#f59e0b' : '#22c55e'};">${l.principal_outstanding != null ? fmt.currency(l.principal_outstanding) : '—'}</td>
                    <td><${LoanPill} status=${l.approval_status} /></td>
                    <td onClick=${e => e.stopPropagation()}>
                      <div style="display:flex;gap:6px;">
                        ${isManager && l.approval_status === 'Pending' && html`
                          <button className="btn btn-ghost btn-sm" onClick=${e => { e.stopPropagation(); setFormErr(''); setForm({ decision:'Approved', rejection_reason:'' }); setDecideModal(l); }}>Review</button>
                        `}
                        ${isManager && l.approval_status === 'Approved' && html`
                          <button className="btn btn-ghost btn-sm" style="color:#22c55e;" onClick=${e => { e.stopPropagation(); handleDisburse(l); }}>Disburse</button>
                        `}
                        ${(isTeller || isManager) && l.approval_status === 'Disbursed' && html`
                          <button className="btn btn-ghost btn-sm" style="color:#60a5fa;" onClick=${e => { e.stopPropagation(); setFormErr(''); setForm({ repay_amount: '' }); setRepayModal(l); }}>Repay</button>
                        `}
                      </div>
                    </td>
                  </tr>
                `)}</tbody>
              </table>
            ` : html`
              <div className="empty-state">
                <div className="empty-icon-wrap"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg></div>
                <div className="empty-state-title">No loans found</div>
              </div>
            `}
        </div>
      </div>

      ${/* DETAIL MODAL */detail && html`
        <${Modal} open=${!!detail} onClose=${() => setDetail(null)} title=${'Loan #' + detail.loan_id} large footer=${html`
          <button className="btn btn-secondary" onClick=${() => setDetail(null)}>Close</button>
          ${isManager && detail.approval_status === 'Pending' && html`
            <button className="btn btn-primary" onClick=${() => { setFormErr(''); setForm({ decision:'Approved', rejection_reason:'' }); setDecideModal(detail); }}>Review</button>
          `}
          ${isManager && detail.approval_status === 'Approved' && html`
            <button className="btn btn-primary" style="background:rgba(34,197,94,.15);color:#22c55e;border-color:rgba(34,197,94,.3);" onClick=${() => handleDisburse(detail)} disabled=${saving}>Disburse</button>
          `}
          ${(isTeller||isManager) && detail.approval_status === 'Disbursed' && html`
            <button className="btn btn-primary" onClick=${() => { setFormErr(''); setForm({ repay_amount:'' }); setRepayModal(detail); }}>Post Repayment</button>
          `}
        `}>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <div>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted-foreground);margin-bottom:8px;">Loan Info</div>
              <${DetailRow} label="Customer" value=${detail.customer_name} />
              <${DetailRow} label="Branch" value=${detail.branch_name} />
              <${DetailRow} label="Amount" value=${fmt.currency(detail.loan_amount)} />
              <${DetailRow} label="Interest rate" value=${detail.interest_rate + '% p.a.'} />
              <${DetailRow} label="Term" value=${detail.term_months ? detail.term_months + ' months' : '—'} />
              <${DetailRow} label="Monthly payment" value=${detail.monthly_payment_amount ? fmt.currency(detail.monthly_payment_amount) : '—'} />
              <${DetailRow} label="Purpose" value=${detail.purpose || '—'} />
              <${DetailRow} label="Start date" value=${fmt.date(detail.start_date)} />
              <${DetailRow} label="End date" value=${fmt.date(detail.end_date)} />
            </div>
            <div>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted-foreground);margin-bottom:8px;">Status</div>
              <div style="margin-bottom:10px;"><${LoanPill} status=${detail.approval_status} /></div>
              <${DetailRow} label="Outstanding" value=${detail.principal_outstanding != null ? fmt.currency(detail.principal_outstanding) : '—'} />
              <${DetailRow} label="Disbursed" value=${detail.disbursement_date ? fmt.date(detail.disbursement_date) : '—'} />
              <${DetailRow} label="Next payment" value=${detail.next_payment_date ? fmt.date(detail.next_payment_date) : '—'} />
              ${detail.approved_by_username && html`<${DetailRow} label="Approved by" value=${detail.approved_by_username} />`}
              ${detail.rejection_reason && html`<${DetailRow} label="Rejection reason" value=${detail.rejection_reason} />`}
              ${detail.created_by_username && html`<${DetailRow} label="Applied by" value=${detail.created_by_username} />`}
            </div>
          </div>

          <div style="margin-top:20px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted-foreground);margin-bottom:10px;">Repayment history</div>
            ${repLoading ? html`<${Spinner} />` : repayments.length ? html`
              <table style="font-size:12px;">
                <thead><tr><th>Date</th><th>Amount</th><th>Principal</th><th>Interest</th><th>Outstanding</th><th>By</th></tr></thead>
                <tbody>${repayments.map(r => html`
                  <tr key=${r.repayment_id}>
                    <td style="color:var(--muted-foreground);">${fmt.datetime(r.paid_at)}</td>
                    <td style="font-weight:600;">${fmt.currency(r.amount)}</td>
                    <td style="color:#22c55e;">${fmt.currency(r.principal_portion)}</td>
                    <td style="color:#f59e0b;">${fmt.currency(r.interest_portion)}</td>
                    <td style="font-weight:500;">${fmt.currency(r.principal_after)}</td>
                    <td style="color:var(--muted-foreground);">${r.created_by_username || '—'}</td>
                  </tr>
                `)}</tbody>
              </table>
            ` : html`<div style="color:var(--muted-foreground);font-size:13px;">No repayments yet.</div>`}
          </div>
        <//>
      `}

      ${/* APPLY MODAL */html`
        <${Modal} open=${applyModal} onClose=${() => setApplyModal(false)} title="Loan Application" large
          footer=${html`
            <button className="btn btn-secondary" onClick=${() => setApplyModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick=${handleApply} disabled=${saving}>${saving ? html`<${Spinner} />` : 'Submit application'}</button>
          `}>
          <form onSubmit=${handleApply} style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div className="form-group" style="margin:0;grid-column:1/-1;">
              <label className="form-label">Customer <span className="form-req">*</span></label>
              <select className="form-select" value=${form.customer_id} onChange=${e => handleCustomerChange(e.target.value)}>
                <option value="">Select customer...</option>
                ${customers.map(c => html`<option key=${c.customer_id} value=${c.customer_id}>${c.first_name} ${c.last_name}</option>`)}
              </select>
            </div>
            <div className="form-group" style="margin:0;grid-column:1/-1;">
              <label className="form-label">Linked account (disbursement/repayment) <span className="form-req">*</span></label>
              <select className="form-select" value=${form.linked_account_id} onChange=${e => setF('linked_account_id', e.target.value)} disabled=${!form.customer_id}>
                <option value="">Select account...</option>
                ${accounts.map(a => html`<option key=${a.account_id} value=${a.account_id}>${a.account_number} — ${fmt.currency(a.balance)}</option>`)}
              </select>
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Branch <span className="form-req">*</span></label>
              <select className="form-select" value=${form.branch_id} onChange=${e => setF('branch_id', e.target.value)}>
                <option value="">Select...</option>
                ${branches.map(b => html`<option key=${b.branch_id} value=${b.branch_id}>${b.branch_name}</option>`)}
              </select>
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Start date <span className="form-req">*</span></label>
              <input type="date" className="form-input" value=${form.start_date} onChange=${e => setF('start_date', e.target.value)} />
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Loan amount (VND) <span className="form-req">*</span></label>
              <input type="number" className="form-input" value=${form.loan_amount} onChange=${e => setF('loan_amount', e.target.value)} min="1" />
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Annual interest rate (%) <span className="form-req">*</span></label>
              <input type="number" className="form-input" value=${form.interest_rate} onChange=${e => setF('interest_rate', e.target.value)} step="0.01" min="0.01" max="99.99" />
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Term (months) <span className="form-req">*</span></label>
              <input type="number" className="form-input" value=${form.term_months} onChange=${e => setF('term_months', e.target.value)} min="1" max="360" />
            </div>
            <div className="form-group" style="margin:0;grid-column:1/-1;">
              <label className="form-label">Purpose</label>
              <input className="form-input" value=${form.purpose||''} onChange=${e => setF('purpose', e.target.value)} placeholder="e.g. Home renovation, Vehicle purchase..." />
            </div>
            ${formErr && html`<div className="alert alert-danger" style="grid-column:1/-1;font-size:12.5px;">${formErr}</div>`}
          </form>
        <//>
      `}

      ${/* DECIDE MODAL */decideModal && html`
        <${Modal} open=${!!decideModal} onClose=${() => setDecideModal(null)} title=${'Review Loan #' + decideModal.loan_id}
          footer=${html`
            <button className="btn btn-secondary" onClick=${() => setDecideModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick=${handleDecide} disabled=${saving}>${saving ? html`<${Spinner} />` : 'Submit decision'}</button>
          `}>
          <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;">
            <div style="padding:10px 14px;background:var(--muted);border-radius:8px;">
              <div style="font-weight:600;">${decideModal.customer_name}</div>
              <div style="color:var(--muted-foreground);font-size:12px;">${fmt.currency(decideModal.loan_amount)} — ${decideModal.term_months} months @ ${decideModal.interest_rate}%</div>
              ${decideModal.purpose && html`<div style="color:var(--muted-foreground);font-size:12px;">${decideModal.purpose}</div>`}
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Decision <span className="form-req">*</span></label>
              <select className="form-select" value=${form.decision} onChange=${e => setF('decision', e.target.value)}>
                <option value="Approved">Approve</option>
                <option value="Rejected">Reject</option>
              </select>
            </div>
            ${form.decision === 'Rejected' && html`
              <div className="form-group" style="margin:0;">
                <label className="form-label">Rejection reason <span className="form-req">*</span></label>
                <textarea className="form-input" rows="2" value=${form.rejection_reason||''} onChange=${e => setF('rejection_reason', e.target.value)} style="resize:vertical;min-height:60px;" />
              </div>
            `}
            ${formErr && html`<div className="alert alert-danger" style="font-size:12.5px;">${formErr}</div>`}
          </div>
        <//>
      `}

      ${/* REPAY MODAL */repayModal && html`
        <${Modal} open=${!!repayModal} onClose=${() => setRepayModal(null)} title=${'Post Repayment — Loan #' + repayModal.loan_id}
          footer=${html`
            <button className="btn btn-secondary" onClick=${() => setRepayModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick=${handleRepay} disabled=${saving||!form.repay_amount}>${saving ? html`<${Spinner} />` : 'Post repayment'}</button>
          `}>
          <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;">
            <div style="padding:10px 14px;background:var(--muted);border-radius:8px;">
              <div style="font-weight:600;">${repayModal.customer_name}</div>
              <div style="color:var(--muted-foreground);font-size:12px;">Outstanding: ${fmt.currency(repayModal.principal_outstanding)}</div>
              ${repayModal.monthly_payment_amount && html`<div style="color:var(--muted-foreground);font-size:12px;">Monthly payment: ${fmt.currency(repayModal.monthly_payment_amount)}</div>`}
            </div>
            <div className="form-group" style="margin:0;">
              <label className="form-label">Payment amount (VND) <span className="form-req">*</span></label>
              <input type="number" className="form-input" value=${form.repay_amount||''} onChange=${e => setF('repay_amount', e.target.value)} min="1"
                placeholder=${repayModal.monthly_payment_amount ? String(Math.round(repayModal.monthly_payment_amount)) : '0'} />
              ${repayModal.monthly_payment_amount && html`
                <button type="button" style="margin-top:5px;padding:3px 9px;border:1px solid var(--border);border-radius:5px;background:transparent;color:var(--muted-foreground);font-size:11px;cursor:pointer;font-family:inherit;"
                  onClick=${() => setF('repay_amount', String(Math.round(repayModal.monthly_payment_amount)))}>
                  Use monthly: ${fmt.currency(repayModal.monthly_payment_amount)}
                </button>
              `}
            </div>
            ${formErr && html`<div className="alert alert-danger" style="font-size:12.5px;">${formErr}</div>`}
          </div>
        <//>
      `}
    </>
  `;
}
