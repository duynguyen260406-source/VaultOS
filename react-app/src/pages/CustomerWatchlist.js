import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import { Spinner } from '../components/Spinner.js';

const FLAG_TYPES = ['', 'VIP', 'Blacklist', 'UnderInvestigation', 'PEP', 'Deceased', 'Incapacitated', 'CourtOrder'];

const FLAG_COLORS = {
  VIP: { bg: 'rgba(250,204,21,.15)', color: '#ca8a04' },
  Blacklist: { bg: 'rgba(239,68,68,.15)', color: '#ef4444' },
  UnderInvestigation: { bg: 'rgba(245,158,11,.15)', color: '#d97706' },
  PEP: { bg: 'rgba(168,85,247,.15)', color: '#a855f7' },
  Deceased: { bg: 'rgba(100,116,139,.15)', color: '#64748b' },
  Incapacitated: { bg: 'rgba(100,116,139,.15)', color: '#64748b' },
  CourtOrder: { bg: 'rgba(239,68,68,.1)', color: '#dc2626' },
};

function FlagPill({ type }) {
  const c = FLAG_COLORS[type] || { bg: 'rgba(100,116,139,.12)', color: 'var(--muted-foreground)' };
  return html`
    <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:${c.bg};color:${c.color};">${type}</span>
  `;
}

export default function CustomerWatchlist() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => { load(); }, [filterType]);

  async function load() {
    setLoading(true); setError('');
    try {
      const params = {};
      if (filterType) params.flag_type = filterType;
      const res = await api.listWatchlist(params);
      setFlags(Array.isArray(res) ? res : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Customer Watchlist</span>
        <div className="topbar-right" style="display:flex;gap:8px;align-items:center;">
          <select className="form-input" style="width:180px;font-size:12px;height:30px;padding:0 8px;"
            value=${filterType} onChange=${e => setFilterType(e.target.value)}>
            <option value="">All flag types</option>
            ${FLAG_TYPES.slice(1).map(t => html`<option key=${t} value=${t}>${t}</option>`)}
          </select>
        </div>
      </header>

      <div className="page">
        ${error && html`<div className="alert alert-danger">${error}</div>`}

        <div className="tbl-wrap">
          <div className="tbl-head">
            <span className="tbl-head-title">Active flags (${flags.length})</span>
          </div>
          ${loading ? html`<div style="padding:40px;text-align:center;"><${Spinner} large /></div>` : flags.length ? html`
            <table>
              <thead>
                <tr>
                  <th>Customer ID</th>
                  <th>Flag type</th>
                  <th>Reason</th>
                  <th>Added</th>
                  <th>Expires</th>
                  <th>Added by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${flags.map(f => html`
                  <tr key=${f.flag_id} className="clickable" onClick=${() => navigate('/customers/' + f.customer_id)}>
                    <td style="font-family:monospace;font-size:12px;">#${f.customer_id}</td>
                    <td><${FlagPill} type=${f.flag_type} /></td>
                    <td style="font-size:12px;color:var(--body-muted);">${f.reason || '—'}</td>
                    <td style="font-size:12px;color:var(--body-muted);">${fmt.date(f.added_at)}</td>
                    <td style="font-size:12px;color:var(--body-muted);">${f.expires_at ? fmt.date(f.expires_at) : '—'}</td>
                    <td style="font-size:12px;">${f.added_by_username || '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm"
                        onClick=${e => { e.stopPropagation(); navigate('/customers/' + f.customer_id); }}>
                        View Customer
                      </button>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          ` : html`
            <div className="empty-state">
              <div className="empty-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div className="empty-state-title">No flagged customers</div>
              <div className="empty-state-text">No active flags match the current filter.</div>
            </div>
          `}
        </div>
      </div>
    </>
  `;
}
