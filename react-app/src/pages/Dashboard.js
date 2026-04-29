import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import { Spinner } from '../components/Spinner.js';

function StatCard({ icon, label, value, sub, href, accent }) {
  const iconEl = html`<div style=${{ width:40, height:40, borderRadius:10, background:'var(--muted)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>${icon}</div>`;
  const textEl = html`<div>
    <div style=${{ fontSize:11, color:'var(--muted-foreground)', marginBottom:2 }}>${label}</div>
    <div style=${{ fontSize:label?'20px':'14px', fontWeight:700, color:accent||'var(--foreground)', lineHeight:1.2 }}>${value}</div>
    <div style=${{ fontSize:11, color:'var(--muted-foreground)', marginTop:2, minHeight: sub ? 'auto' : 0 }}>${sub || ''}</div>
  </div>`;
  if (href) return html`<${Link} to=${href} className="stat-card" style=${{ display:'flex', alignItems:'center', gap:14, cursor:'pointer', textDecoration:'none' }}>${iconEl}${textEl}<//>`;
  return html`<div className="stat-card" style=${{ display:'flex', alignItems:'center', gap:14 }}>${iconEl}${textEl}</div>`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const [stats, setStats]         = useState(null);
  const [recentTx, setRecentTx]   = useState(null);
  const [rightPanel, setRightPanel] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const today = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setRefreshing(true);
    await Promise.all([loadStats(), loadRecentTx(), loadRightPanel()]);
    setRefreshing(false);
  }

  async function loadStats() {
    try {
      if (role === 'teller') {
        setStats({ type: 'teller' });
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        const [report, customers, accounts] = await Promise.allSettled([
          api.dailyReport({ report_date: todayStr }),
          api.listCustomers({ limit: 1 }),
          api.searchAccounts(''),
        ]);
        const r = report.status === 'fulfilled' ? report.value : null;
        const custTotal = customers.status === 'fulfilled' ? (customers.value.total || 0) : '-';
        const acctTotal = accounts.status === 'fulfilled' ? (accounts.value.total || accounts.value.accounts?.length || 0) : '-';
        setStats({ type: 'manager', total: r?.grand_total ?? 0, count: r?.grand_count ?? 0, custTotal, acctTotal });
      }
    } catch (e) { setStatsError(e.message); }
  }

  async function loadRecentTx() {
    if (role === 'teller') { setRecentTx({ type: 'teller' }); return; }
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const r = await api.dailyReport({ report_date: todayStr });
      const rows = r?.rows || [];
      // merge transfer in/out
      const merged = {};
      for (const row of rows) {
        const key = row.transaction_type?.toLowerCase().startsWith('transfer') ? 'Transfer' : row.transaction_type;
        if (!merged[key]) merged[key] = { transaction_type: key, transaction_count: 0, total_amount: 0, _sides: 0 };
        if (key === 'Transfer') {
          merged[key]._sides++;
          merged[key].transaction_count = Math.max(merged[key].transaction_count, Number(row.transaction_count) || 0);
          merged[key].total_amount += Number(row.total_amount) || 0;
        } else {
          merged[key].transaction_count += Number(row.transaction_count) || 0;
          merged[key].total_amount += Number(row.total_amount) || 0;
        }
      }
      for (const v of Object.values(merged)) {
        if (v.transaction_type === 'Transfer' && v._sides >= 2) v.total_amount /= 2;
      }
      const mergedRows = Object.values(merged);
      const grandTotal = mergedRows.reduce((s, r) => s + r.total_amount, 0);
      setRecentTx({ rows: mergedRows, date: r?.report_date, total: grandTotal });
    } catch (e) { setRecentTx({ error: e.message }); }
  }

  async function loadRightPanel() {
    try {
      if (role === 'teller') {
        const res = await api.searchAccounts('');
        setRightPanel({ type: 'teller', accounts: res?.accounts || [], total: res?.total || 0 });
      } else if (role === 'manager') {
        const rows = await api.branchReport();
        setRightPanel({ type: 'manager', rows: rows || [] });
      } else {
        const rows = await api.balancesReport();
        setRightPanel({ type: 'auditor', rows: rows || [] });
      }
    } catch (e) { setRightPanel({ error: e.message }); }
  }

  const TYPE_COLOR = { deposit:'#22c55e', withdrawal:'#ef4444', transfer:'#91c5ff' };
  const typeColor = t => TYPE_COLOR[t?.toLowerCase()] || 'var(--foreground)';

  const QUICK_ACTIONS = [
    { label:'New Customer',  href:'/customers?action=new',        color:'#91c5ff', icon: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>` },
    { label:'Open Account',  href:'/customers?action=open-account', color:'#91c5ff', icon: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>` },
    { label:'Deposit',       href:'/transactions?type=deposit',    color:'#22c55e', icon: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 5 5 12"/></svg>` },
    { label:'Withdraw',      href:'/transactions?type=withdraw',   color:'#ef4444', icon: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/></svg>` },
    { label:'Transfer',      href:'/transactions?type=transfer',   color:'#f59e0b', icon: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>` },
    ...(role === 'manager' ? [
      { label:'Reports',   href:'/reports', color:'#a78bfa', icon: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>` },
      { label:'Audit',     href:'/audit',   color:'#f59e0b', icon: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>` },
    ] : []),
  ];

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Dashboard</span>
        <div className="topbar-right">
          <span style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${today}</span>
          <button className="btn btn-secondary btn-sm" onClick=${loadAll} disabled=${refreshing}
            style=${{ display:'inline-flex', alignItems:'center', gap:5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style=${{ transform: refreshing ? 'rotate(360deg)' : 'none', transition:'transform .6s linear' }}>
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>
      </header>

      <div className="page">
        <div style=${{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12, marginBottom:22 }}>
          ${statsError
            ? html`<div className="alert alert-warning" style=${{ gridColumn:'1/-1' }}>${statsError}</div>`
            : !stats
              ? [0,1,2,3].map(i => html`<div key=${i} className="stat-card skeleton" style=${{ height:90 }}></div>`)
              : stats.type === 'teller'
                ? html`
                    <${StatCard} href="/customers"              label="Customers"         value="Browse" sub="View all customers"    icon=${html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#91c5ff" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`} />
                    <${StatCard} href="/accounts"               label="Accounts"          value="Search" sub="Look up any account"   icon=${html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#91c5ff" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`} />
                    <${StatCard} href="/transactions"           label="Deposit / Withdraw" value="Process" sub="Handle cash transactions" icon=${html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`} />
                    <${StatCard} href="/transactions?type=transfer" label="Transfer"      value="Send funds" sub="Between accounts" icon=${html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`} />
                  `
                : stats.type === 'manager'
                  ? html`
                      <${StatCard} label="Total customers"      value=${fmt.num(stats.custTotal)}       sub="All time"     accent="#91c5ff" icon=${html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#91c5ff" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`} />
                      <${StatCard} label="Total accounts"       value=${fmt.num(stats.acctTotal)}       sub="All time"     accent="#a78bfa" icon=${html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`} />
                      <${StatCard} label="Today's transactions" value=${fmt.num(stats.count)}           sub="Count today"  accent="#22c55e" icon=${html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`} />
                      <${StatCard} label="Today's volume"       value=${fmt.currency(stats.total)}      sub="Total amount" accent="#f59e0b" icon=${html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`} />
                    `
                  : null
          }
        </div>

        ${role !== 'auditor' && html`
          <div style=${{ marginBottom:22, background:'var(--card)', border:'1px solid var(--border)', borderRadius:11, padding:16 }}>
            <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>Quick actions</div>
            <div style=${{ display:'flex', flexWrap:'wrap', gap:8 }}>
              ${QUICK_ACTIONS.map(a => html`
                <${Link} key=${a.label} to=${a.href} className="btn btn-secondary"
                  style=${{ color:a.color, borderColor:a.color+'40', background:a.color+'12', display:'inline-flex', alignItems:'center', gap:6 }}>
                  ${a.icon}${a.label}
                <//>
              `)}
            </div>
          </div>
        `}

        <div style=${{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div className="tbl-wrap">
            <div className="tbl-head">
              <span className="tbl-head-title">Today's transactions</span>
              ${recentTx?.rows?.length > 0 && html`<${Link} to="/reports" style=${{ fontSize:11.5, color:'var(--chart-2)' }}>Full report →<//>`}
            </div>
            ${!recentTx
              ? html`<div className="empty-state"><${Spinner} /></div>`
              : recentTx.type === 'teller' ? html`
                <div className="empty-state">
                  <div className="empty-icon-wrap"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
                  <div className="empty-state-title">Process a transaction</div>
                  <div className="empty-state-text">Use the quick actions above to deposit, withdraw, or transfer.</div>
                </div>
              ` : recentTx.error ? html`
                <div className="empty-state"><div className="empty-state-text" style=${{ color:'#ef4444' }}>${recentTx.error}</div></div>
              ` : !recentTx.rows.length ? html`
                <div className="empty-state"><div className="empty-state-title">No transactions today</div><div className="empty-state-text">Nothing recorded yet for ${fmt.date(recentTx.date)}.</div></div>
              ` : html`
                <table>
                  <thead><tr><th>Type</th><th style=${{ textAlign:'right' }}>Count</th><th style=${{ textAlign:'right' }}>Total</th></tr></thead>
                  <tbody>${recentTx.rows.map(row => html`
                    <tr key=${row.transaction_type}>
                      <td style=${{ fontWeight:500 }}>
                        <span style=${{ display:'inline-block', width:8, height:8, borderRadius:'50%', background: typeColor(row.transaction_type), marginRight:8 }}></span>
                        ${row.transaction_type}
                      </td>
                      <td style=${{ textAlign:'right', color:'var(--muted-foreground)' }}>${fmt.num(row.transaction_count)}</td>
                      <td style=${{ textAlign:'right', color: typeColor(row.transaction_type), fontWeight:500 }}>${fmt.currency(row.total_amount)}</td>
                    </tr>
                  `)}</tbody>
                </table>
                <div className="tbl-foot">
                  <span>${fmt.date(recentTx.date)}</span>
                  <span style=${{ fontWeight:700, color:'var(--chart-2)' }}>${fmt.currency(recentTx.total)}</span>
                </div>
              `
            }
          </div>

          <div className="tbl-wrap">
            <div className="tbl-head">
              <span className="tbl-head-title">
                ${role === 'teller' ? 'Branch accounts' : role === 'manager' ? 'Branch activity' : 'Top customer balances'}
              </span>
              ${role !== 'teller' && html`<${Link} to="/reports" style=${{ fontSize:11.5, color:'var(--chart-2)' }}>Full report →<//>`}
            </div>
            ${!rightPanel
              ? html`<div className="empty-state"><${Spinner} /></div>`
              : rightPanel.error ? html`<div className="empty-state"><div className="empty-state-text" style=${{ color:'#ef4444' }}>${rightPanel.error}</div></div>`
              : rightPanel?.type === 'teller' ? html`
              ${!rightPanel.accounts.length
                ? html`<div className="empty-state"><div className="empty-state-text">No accounts in your branch yet.</div></div>`
                : html`
                  <table>
                    <thead><tr><th>Account #</th><th>Customer</th><th style=${{ textAlign:'right' }}>Balance</th></tr></thead>
                    <tbody>${rightPanel.accounts.slice(0, 8).map(a => html`
                      <tr key=${a.account_id} className="clickable" onClick=${() => navigate('/accounts/' + a.account_id)}>
                        <td style=${{ fontFamily:'monospace', fontSize:12 }}>${a.account_number}</td>
                        <td>${a.customer_name}</td>
                        <td style=${{ textAlign:'right', color:'var(--chart-2)', fontWeight:500 }}>${fmt.currency(a.balance)}</td>
                      </tr>
                    `)}</tbody>
                  </table>
                  <div className="tbl-foot">
                    <span>${rightPanel.total} account(s)</span>
                    <${Link} to="/accounts" style=${{ fontSize:11.5, color:'var(--chart-2)' }}>View all →<//>
                  </div>
                `
              }
            ` : rightPanel?.type === 'manager' ? html`
              ${!rightPanel.rows.length
                ? html`<div className="empty-state"><div className="empty-state-text">No branch data.</div></div>`
                : html`
                  <table>
                    <thead><tr><th>Branch</th><th style=${{ textAlign:'right' }}>Accounts</th><th style=${{ textAlign:'right' }}>Deposits</th></tr></thead>
                    <tbody>${rightPanel.rows.slice(0, 7).map(r => html`
                      <tr key=${r.branch_name}>
                        <td style=${{ fontWeight:500 }}>${r.branch_name}</td>
                        <td style=${{ textAlign:'right', color:'var(--muted-foreground)' }}>${fmt.num(r.account_count)}</td>
                        <td style=${{ textAlign:'right', color:'#22c55e', fontWeight:500 }}>${fmt.currency(r.total_deposits)}</td>
                      </tr>
                    `)}</tbody>
                  </table>
                  <div className="tbl-foot"><span>${rightPanel.rows.length} branch(es)</span></div>
                `
              }
            ` : rightPanel?.type === 'auditor' ? html`
              ${!rightPanel.rows.length
                ? html`<div className="empty-state"><div className="empty-state-text">No data.</div></div>`
                : html`
                  <table>
                    <thead><tr><th>Customer</th><th style=${{ textAlign:'right' }}>Total balance</th></tr></thead>
                    <tbody>${rightPanel.rows.slice(0, 8).map(r => html`
                      <tr key=${r.customer_name}>
                        <td>${r.customer_name}</td>
                        <td style=${{ textAlign:'right', color:'var(--chart-2)', fontWeight:500 }}>${fmt.currency(r.total_balance)}</td>
                      </tr>
                    `)}</tbody>
                  </table>
                `
              }
            ` : null}
          </div>
        </div>
      </div>
    </>
  `;
}
