import { html } from '../lib/html.js';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmt, debounce } from '../lib/utils.js';
import { LoadingRow, StatusBadge } from '../components/Spinner.js';

const STATUS_OPTS = ['', 'active', 'closed'];

export default function Accounts() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query,     setQuery]     = useState(() => searchParams.get('q') || '');
  const [status,    setStatus]    = useState('');
  const [accounts,  setAccounts]  = useState(null);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const doSearch = useCallback(debounce(async (q, st) => {
    if (!q && !st) { setAccounts(null); setTotal(0); return; }
    setLoading(true); setError('');
    try {
      const data = await api.searchAccounts(q || '');
      let list = data.accounts || [];
      if (st) list = list.filter(a => a.status?.toLowerCase() === st);
      setAccounts(list);
      setTotal(list.length);
    } catch (e) { setError(e.message); setAccounts([]); }
    finally { setLoading(false); }
  }, 350), []);

  useEffect(() => { if (query) doSearch(query, status); }, []);

  const handleSearch = (val) => { setQuery(val); doSearch(val, status); };
  const handleStatus = (val) => { setStatus(val); doSearch(query, val); };
  const handleClear  = ()    => { setQuery(''); setStatus(''); setAccounts(null); setTotal(0); };

  const activeCount = accounts ? accounts.filter(a => a.status?.toLowerCase() === 'active').length : null;
  const closedCount = accounts ? accounts.filter(a => a.status?.toLowerCase() === 'closed').length : null;
  const totalBalance = accounts ? accounts.reduce((s, a) => s + (a.balance || 0), 0) : null;

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Accounts</span>
      </header>

      <div className="page">
        <div className="tbl-wrap">
          <div className="tbl-head">
            <span className="tbl-head-title">Account search</span>
            <div className="filter-bar">
              <div className="search-wrap">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" className="form-input" placeholder="Account #, customer name, or ID..."
                  value=${query} onChange=${e => handleSearch(e.target.value)} style=${{ width:280 }} />
              </div>
              <select className="form-select" style=${{ width:130 }} value=${status} onChange=${e => handleStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
              ${(query || status) && html`
                <button className="btn btn-secondary btn-sm" onClick=${handleClear}>Clear</button>
              `}
            </div>
          </div>

          ${accounts !== null && accounts.length > 0 && html`
            <div style=${{ display:'flex', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
              <div style=${{ fontSize:12, color:'var(--muted-foreground)' }}>
                <span style=${{ fontWeight:600, color:'var(--foreground)' }}>${total}</span> result${total !== 1 ? 's' : ''}
                ${activeCount !== null && html` · <span style=${{ color:'#22c55e' }}>${activeCount} active</span>`}
                ${closedCount > 0 && html` · <span style=${{ color:'var(--muted-foreground)' }}>${closedCount} closed</span>`}
              </div>
              ${totalBalance !== null && html`
                <div style=${{ fontSize:12, color:'var(--muted-foreground)', marginLeft:'auto' }}>
                  Total balance: <span style=${{ fontWeight:600, color:'var(--chart-2)' }}>${fmt.currency(totalBalance)}</span>
                </div>
              `}
            </div>
          `}

          <table>
            <thead>
              <tr>
                <th>Account #</th><th>Customer</th><th>Type</th><th>Branch</th>
                <th style=${{ textAlign:'right' }}>Balance</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${loading && html`<${LoadingRow} cols=${7} />`}
              ${error && html`<tr><td colSpan="7"><div className="alert alert-danger" style=${{ margin:16 }}>${error}</div></td></tr>`}
              ${!loading && accounts === null && html`
                <tr><td colSpan="7">
                  <div className="empty-state">
                    <div className="empty-icon-wrap">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                    </div>
                    <div className="empty-state-title">Search to find accounts</div>
                    <div className="empty-state-text">Type an account number, customer name, or account ID above.</div>
                  </div>
                </td></tr>
              `}
              ${!loading && accounts !== null && accounts.length === 0 && html`
                <tr><td colSpan="7">
                  <div className="empty-state">
                    <div className="empty-state-title">No accounts found</div>
                    <div className="empty-state-text">No accounts match your search${status ? ` with status "${status}"` : ''}.</div>
                  </div>
                </td></tr>
              `}
              ${!loading && accounts?.map(a => html`
                <tr key=${a.account_id} className="clickable" onClick=${() => navigate('/accounts/' + a.account_id)}>
                  <td style=${{ fontFamily:'monospace', fontSize:12 }}>${a.account_number}</td>
                  <td>
                    <${Link} to=${'/customers/' + a.customer_id} style=${{ color:'var(--chart-2)' }}
                      onClick=${e => e.stopPropagation()}>${a.customer_name}<//>
                  </td>
                  <td style=${{ fontSize:12 }}>${a.account_type}</td>
                  <td style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${a.branch_name}</td>
                  <td style=${{ textAlign:'right', color:'var(--chart-2)', fontWeight:500, fontVariantNumeric:'tabular-nums' }}>${fmt.currency(a.balance)}</td>
                  <td><${StatusBadge} status=${a.status} /></td>
                  <td>
                    <${Link} to=${'/accounts/' + a.account_id} className="btn btn-ghost btn-sm"
                      onClick=${e => e.stopPropagation()}>View<//>
                  </td>
                </tr>
              `)}
            </tbody>
          </table>

          <div className="tbl-foot">
            <span>${accounts !== null ? `${total} result${total !== 1 ? 's' : ''}` : 'Enter a search query above'}</span>
          </div>
        </div>
      </div>
    </>
  `;
}
