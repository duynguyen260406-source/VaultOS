import { html } from '../lib/html.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import Modal from '../components/Modal.js';
import { Spinner } from '../components/Spinner.js';

function useAccountLookup() {
  const [query, setQuery] = useState('');
  const [account, setAccount] = useState(null);

  const setPreloaded = useCallback((acc) => {
    if (!acc) return;
    setAccount(acc);
    setQuery(acc.account_number || String(acc.account_id));
  }, []);

  const clear = useCallback(() => { setQuery(''); setAccount(null); }, []);

  return { query, setQuery, account, setPreloaded, clear };
}

function AccountSearch({ label, hook, placeholder }) {
  const { query, setQuery, account, setPreloaded, clear } = hook;
  const [suggestions, setSuggestions] = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = val => {
    setQuery(val);
    if (account) clear();
    clearTimeout(debounceRef.current);
    if (!val.trim()) { setSuggestions([]); setShowDrop(false); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchAccounts(val);
        const list = res.accounts || [];
        setSuggestions(list);
        setShowDrop(list.length > 0);
      } catch {}
      finally { setSearching(false); }
    }, 280);
  };

  const select = acc => { setPreloaded(acc); setSuggestions([]); setShowDrop(false); };

  return html`
    <div className="form-group" ref=${wrapRef} style="position:relative;">
      <label className="form-label">${label} <span className="form-req">*</span></label>
      <div style="position:relative;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#525252;pointer-events:none;z-index:1;">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text" className="form-input" autoComplete="off"
          style="padding-left:34px;"
          placeholder=${placeholder}
          value=${query}
          onChange=${e => handleChange(e.target.value)}
          onFocus=${() => suggestions.length > 0 && !account && setShowDrop(true)}
        />
        ${searching && html`<div style="position:absolute;right:10px;top:50%;transform:translateY(-50%);"><${Spinner} /></div>`}
        ${account && html`
          <button type="button"
            style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#525252;cursor:pointer;display:flex;align-items:center;padding:3px;border-radius:4px;transition:color .15s;"
            onMouseOver=${e => e.currentTarget.style.color='#fafafa'}
            onMouseOut=${e => e.currentTarget.style.color='#525252'}
            onClick=${() => { clear(); setSuggestions([]); }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        `}
        ${showDrop && suggestions.length > 0 && html`
          <div style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:#111111;border:1px solid #262626;border-radius:9px;z-index:300;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,.55);">
            ${suggestions.slice(0, 8).map(acc => html`
              <div key=${acc.account_id}
                style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #1a1a1a;transition:background .1s;"
                onMouseOver=${e => e.currentTarget.style.background='rgba(255,255,255,.04)'}
                onMouseOut=${e => e.currentTarget.style.background=''}
                onClick=${() => select(acc)}
              >
                <div>
                  <div style="font-size:12.5px;font-weight:600;color:#fafafa;font-family:ui-monospace,monospace;">${acc.account_number}</div>
                  <div style="font-size:12px;color:#a1a1a1;margin-top:1px;">${acc.customer_name}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="font-size:12px;color:#fafafa;font-weight:500;">${fmt.currency(acc.balance)}</div>
                  <div style="font-size:11px;margin-top:2px;color:${acc.status === 'active' ? '#22c55e' : '#a1a1a1'};">${acc.status}</div>
                </div>
              </div>
            `)}
          </div>
        `}
      </div>
    </div>
  `;
}

function AccountCard({ account, label, emptyText }) {
  if (!account) return html`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:170px;border:1px dashed #1f1f1f;border-radius:11px;padding:24px;text-align:center;gap:10px;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
      <p style="font-size:12px;color:#333333;margin:0;">${emptyText}</p>
    </div>
  `;
  return html`
    <div className="card">
      <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#525252;margin-bottom:12px;">${label}</div>
      <div style="font-family:ui-monospace,monospace;font-size:14px;font-weight:600;color:#fafafa;letter-spacing:.04em;margin-bottom:3px;">${account.account_number}</div>
      <div style="font-size:13px;color:#a1a1a1;margin-bottom:18px;">${account.customer_name}</div>
      <div style="font-size:24px;font-weight:700;letter-spacing:-.02em;color:#fafafa;margin-bottom:14px;">${fmt.currency(account.balance)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <span className=${'badge ' + (account.status === 'active' ? 'badge-green' : 'badge-gray')}>${account.status}</span>
        ${account.account_type && html`<span className="badge badge-gray">${account.account_type}</span>`}
      </div>
    </div>
  `;
}

function QuickAmounts({ onSelect }) {
  const amounts = [100000, 500000, 1000000, 5000000, 10000000];
  return html`
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;">
      ${amounts.map(a => html`
        <button key=${a} type="button"
          style="padding:3px 9px;border-radius:5px;border:1px solid #262626;background:transparent;color:#a1a1a1;font-size:11px;cursor:pointer;font-family:inherit;transition:border-color .12s,color .12s;"
          onMouseOver=${e => { e.currentTarget.style.borderColor='#525252'; e.currentTarget.style.color='#fafafa'; }}
          onMouseOut=${e => { e.currentTarget.style.borderColor='#262626'; e.currentTarget.style.color='#a1a1a1'; }}
          onClick=${() => onSelect(String(a))}
        >${fmt.currency(a)}</button>
      `)}
    </div>
  `;
}

export default function Transactions() {
  const [searchParams] = useSearchParams();
  const preAccountId = searchParams.get('account_id');
  const [activeTab, setActiveTab] = useState(searchParams.get('type') || 'deposit');

  const dHook = useAccountLookup();
  const wHook = useAccountLookup();
  const tFromHook = useAccountLookup();
  const tToHook = useAccountLookup();

  const [dAmount, setDAmount] = useState('');
  const [wAmount, setWAmount] = useState('');
  const [tAmount, setTAmount] = useState('');
  const [dError, setDError] = useState('');
  const [wError, setWError] = useState('');
  const [tError, setTError] = useState('');
  const [submitting, setSubmitting] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);
  const confirmResolve = useRef(null);
  const [successModal, setSuccessModal] = useState(null);

  useEffect(() => {
    if (!preAccountId) return;
    api.getAccount(preAccountId).then(acc => {
      dHook.setPreloaded(acc); wHook.setPreloaded(acc); tFromHook.setPreloaded(acc);
    }).catch(() => {});
  }, [preAccountId]);

  function openConfirm(title, lines) {
    return new Promise(resolve => {
      confirmResolve.current = resolve;
      setConfirmModal({ title, lines });
    });
  }
  function resolveConfirm(val) {
    setConfirmModal(null);
    if (confirmResolve.current) { confirmResolve.current(val); confirmResolve.current = null; }
  }

  async function submitDeposit(e) {
    e.preventDefault(); setDError('');
    const amount = parseFloat(dAmount);
    if (!dHook.account) { setDError('Select an account first.'); return; }
    if (!amount || amount <= 0) { setDError('Amount must be greater than zero.'); return; }
    const ok = await openConfirm('Confirm deposit', [
      ['Account', dHook.account.account_number],
      ['Customer', dHook.account.customer_name],
      ['Amount', fmt.currency(amount)],
    ]);
    if (!ok) return;
    setSubmitting('deposit');
    try {
      const res = await api.deposit({ account_id: dHook.account.account_id, amount });
      setSuccessModal({ msg: res.message, accountId: dHook.account.account_id });
    } catch (e) { setDError(e.message); }
    finally { setSubmitting(''); }
  }

  async function submitWithdraw(e) {
    e.preventDefault(); setWError('');
    const amount = parseFloat(wAmount);
    if (!wHook.account) { setWError('Select an account first.'); return; }
    if (!amount || amount <= 0) { setWError('Amount must be greater than zero.'); return; }
    const ok = await openConfirm('Confirm withdrawal', [
      ['Account', wHook.account.account_number],
      ['Customer', wHook.account.customer_name],
      ['Amount', fmt.currency(amount)],
    ]);
    if (!ok) return;
    setSubmitting('withdraw');
    try {
      const res = await api.withdraw({ account_id: wHook.account.account_id, amount });
      setSuccessModal({ msg: res.message, accountId: wHook.account.account_id });
    } catch (e) { setWError(e.message); }
    finally { setSubmitting(''); }
  }

  async function submitTransfer(e) {
    e.preventDefault(); setTError('');
    const amount = parseFloat(tAmount);
    if (!tFromHook.account) { setTError('Select a source account.'); return; }
    if (!tToHook.account) { setTError('Select a destination account.'); return; }
    if (tFromHook.account.account_id === tToHook.account.account_id) { setTError('Source and destination must be different.'); return; }
    if (!amount || amount <= 0) { setTError('Amount must be greater than zero.'); return; }
    const ok = await openConfirm('Confirm transfer', [
      ['From', tFromHook.account.account_number],
      ['To', tToHook.account.account_number],
      ['Amount', fmt.currency(amount)],
    ]);
    if (!ok) return;
    setSubmitting('transfer');
    try {
      const res = await api.transfer({ from_account_id: tFromHook.account.account_id, to_account_id: tToHook.account.account_id, amount });
      setSuccessModal({ msg: res.message, accountId: tFromHook.account.account_id });
    } catch (e) { setTError(e.message); }
    finally { setSubmitting(''); }
  }

  function resetForms() {
    setDAmount(''); setWAmount(''); setTAmount('');
    setDError(''); setWError(''); setTError('');
    dHook.clear(); wHook.clear(); tFromHook.clear(); tToHook.clear();
    setSuccessModal(null);
  }

  const tabMeta = {
    deposit:  { color: '#22c55e', label: 'Deposit',  icon: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 5 5 12"/></svg>` },
    withdraw: { color: '#ef4444', label: 'Withdraw', icon: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg>` },
    transfer: { color: '#f59e0b', label: 'Transfer', icon: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>` },
  };

  return html`
    <>
      <header className="topbar"><span className="topbar-title">Transactions</span></header>

      <div className="page">
        <div className="tabs" style="margin-bottom:22px;">
          ${['deposit','withdraw','transfer'].map(tab => html`
            <div key=${tab} className=${'tab' + (activeTab === tab ? ' active' : '')} onClick=${() => setActiveTab(tab)}
              style="display:flex;align-items:center;gap:6px;">
              <span style="color:${activeTab === tab ? tabMeta[tab].color : 'var(--muted-foreground)'};">${tabMeta[tab].icon}</span>
              ${tabMeta[tab].label}
            </div>
          `)}
        </div>

        ${activeTab === 'deposit' && html`
          <div style="display:grid;grid-template-columns:minmax(0,420px) minmax(0,340px);gap:18px;align-items:start;">
            <div className="card">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border);">
                <div style="width:32px;height:32px;border-radius:8px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);display:flex;align-items:center;justify-content:center;color:#22c55e;flex-shrink:0;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 5 5 12"/></svg>
                </div>
                <div>
                  <div style="font-size:14px;font-weight:600;letter-spacing:-.01em;">Deposit funds</div>
                  <div style="font-size:12px;color:var(--muted-foreground);margin-top:1px;">Add money to a customer account</div>
                </div>
              </div>
              <form onSubmit=${submitDeposit} style="display:flex;flex-direction:column;gap:14px;">
                <${AccountSearch} label="Account" hook=${dHook} placeholder="Search by account number, ID, or name..." />
                <div className="form-group">
                  <label className="form-label">Amount (VND) <span className="form-req">*</span></label>
                  <input type="number" className="form-input" value=${dAmount} onChange=${e => setDAmount(e.target.value)} placeholder="0" min="1" />
                  <${QuickAmounts} onSelect=${setDAmount} />
                </div>
                ${dError && html`<div className="alert alert-danger" style="font-size:12.5px;">${dError}</div>`}
                <button type="submit" disabled=${submitting === 'deposit' || !dHook.account || !dAmount}
                  style="width:100%;justify-content:center;padding:10px;border-radius:8px;border:1px solid rgba(34,197,94,.25);background:rgba(34,197,94,.1);color:#22c55e;font-size:13.5px;font-weight:500;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:7px;transition:opacity .15s;opacity:${(submitting === 'deposit' || !dHook.account || !dAmount) ? .4 : 1};">
                  ${submitting === 'deposit' ? html`<${Spinner} />` : html`
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 5 5 12"/></svg>
                    Confirm Deposit
                  `}
                </button>
              </form>
            </div>
            <${AccountCard} account=${dHook.account} label="Selected account" emptyText="Search and select an account to see details" />
          </div>
        `}

        ${activeTab === 'withdraw' && html`
          <div style="display:grid;grid-template-columns:minmax(0,420px) minmax(0,340px);gap:18px;align-items:start;">
            <div className="card">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border);">
                <div style="width:32px;height:32px;border-radius:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);display:flex;align-items:center;justify-content:center;color:#ef4444;flex-shrink:0;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg>
                </div>
                <div>
                  <div style="font-size:14px;font-weight:600;letter-spacing:-.01em;">Withdraw funds</div>
                  <div style="font-size:12px;color:var(--muted-foreground);margin-top:1px;">Remove money from a customer account</div>
                </div>
              </div>
              <form onSubmit=${submitWithdraw} style="display:flex;flex-direction:column;gap:14px;">
                <${AccountSearch} label="Account" hook=${wHook} placeholder="Search by account number, ID, or name..." />
                <div className="form-group">
                  <label className="form-label">Amount (VND) <span className="form-req">*</span></label>
                  <input type="number" className="form-input" value=${wAmount} onChange=${e => setWAmount(e.target.value)} placeholder="0" min="1" />
                  <${QuickAmounts} onSelect=${setWAmount} />
                </div>
                ${wError && html`<div className="alert alert-danger" style="font-size:12.5px;">${wError}</div>`}
                <button type="submit" disabled=${submitting === 'withdraw' || !wHook.account || !wAmount}
                  style="width:100%;justify-content:center;padding:10px;border-radius:8px;border:1px solid rgba(239,68,68,.25);background:rgba(239,68,68,.1);color:#ef4444;font-size:13.5px;font-weight:500;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:7px;transition:opacity .15s;opacity:${(submitting === 'withdraw' || !wHook.account || !wAmount) ? .4 : 1};">
                  ${submitting === 'withdraw' ? html`<${Spinner} />` : html`
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg>
                    Confirm Withdrawal
                  `}
                </button>
              </form>
            </div>
            <${AccountCard} account=${wHook.account} label="Selected account" emptyText="Search and select an account to see details" />
          </div>
        `}

        ${activeTab === 'transfer' && html`
          <div style="display:grid;grid-template-columns:minmax(0,420px) minmax(0,340px);gap:18px;align-items:start;">
            <div className="card">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border);">
                <div style="width:32px;height:32px;border-radius:8px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.2);display:flex;align-items:center;justify-content:center;color:#f59e0b;flex-shrink:0;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                </div>
                <div>
                  <div style="font-size:14px;font-weight:600;letter-spacing:-.01em;">Transfer funds</div>
                  <div style="font-size:12px;color:var(--muted-foreground);margin-top:1px;">Move money between accounts</div>
                </div>
              </div>
              <form onSubmit=${submitTransfer} style="display:flex;flex-direction:column;gap:14px;">
                <${AccountSearch} label="From account" hook=${tFromHook} placeholder="Search source account..." />
                <div style="display:flex;align-items:center;gap:8px;color:var(--muted-foreground);">
                  <div style="flex:1;height:1px;background:var(--border);"></div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg>
                  <div style="flex:1;height:1px;background:var(--border);"></div>
                </div>
                <${AccountSearch} label="To account" hook=${tToHook} placeholder="Search destination account..." />
                <div className="form-group">
                  <label className="form-label">Amount (VND) <span className="form-req">*</span></label>
                  <input type="number" className="form-input" value=${tAmount} onChange=${e => setTAmount(e.target.value)} placeholder="0" min="1" />
                  <${QuickAmounts} onSelect=${setTAmount} />
                </div>
                ${tError && html`<div className="alert alert-danger" style="font-size:12.5px;">${tError}</div>`}
                <button type="submit" disabled=${submitting === 'transfer' || !tFromHook.account || !tToHook.account || !tAmount}
                  style="width:100%;justify-content:center;padding:10px;border-radius:8px;border:1px solid rgba(245,158,11,.25);background:rgba(245,158,11,.1);color:#f59e0b;font-size:13.5px;font-weight:500;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:7px;transition:opacity .15s;opacity:${(submitting === 'transfer' || !tFromHook.account || !tToHook.account || !tAmount) ? .4 : 1};">
                  ${submitting === 'transfer' ? html`<${Spinner} />` : html`
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                    Confirm Transfer
                  `}
                </button>
              </form>
            </div>
            <div style="display:flex;flex-direction:column;gap:14px;">
              <${AccountCard} account=${tFromHook.account} label="From account" emptyText="Search and select source account" />
              ${(tFromHook.account && tToHook.account) && html`
                <div style="display:flex;justify-content:center;color:var(--muted-foreground);">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg>
                </div>
              `}
              <${AccountCard} account=${tToHook.account} label="To account" emptyText="Search and select destination account" />
            </div>
          </div>
        `}
      </div>

      <${Modal}
        open=${!!confirmModal}
        onClose=${() => resolveConfirm(false)}
        title=${confirmModal?.title}
        footer=${html`
          <button className="btn btn-secondary" onClick=${() => resolveConfirm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick=${() => resolveConfirm(true)}>Confirm</button>
        `}
      >
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
          ${confirmModal?.lines?.map(([label, value]) => html`
            <div key=${label} style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:8px 0;border-bottom:1px solid var(--border);">
              <span style="color:var(--muted-foreground);">${label}</span>
              <strong style="color:var(--foreground);">${value}</strong>
            </div>
          `)}
        </div>
      <//>

      <${Modal} open=${!!successModal} onClose=${resetForms} title=" " footer=${null}>
        <div style="text-align:center;padding:8px 0;">
          <div style="width:52px;height:52px;border-radius:50%;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.25);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style="font-size:16px;font-weight:600;letter-spacing:-.01em;">Transaction complete</div>
          <div style="font-size:13px;color:var(--muted-foreground);margin-top:6px;">${successModal?.msg}</div>
          <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;justify-content:center;">
            <button className="btn btn-secondary" onClick=${resetForms}>New transaction</button>
            <${Link} to=${'/accounts/' + successModal?.accountId} className="btn btn-primary" onClick=${resetForms}>View account<//>
          </div>
        </div>
      <//>
    </>
  `;
}
