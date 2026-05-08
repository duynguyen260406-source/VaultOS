import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import { Spinner } from '../components/Spinner.js';

const DAYS_OPTS = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days' },
];

const TABS = ['summary', 'branch', 'teller'];

function KpiCard({ label, value, sub }) {
  return html`
    <div className="card" style="flex:1;min-width:160px;">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted-foreground);margin-bottom:6px;">${label}</div>
      <div style="font-size:22px;font-weight:700;letter-spacing:-.02em;">${value}</div>
      ${sub && html`<div style="font-size:12px;color:var(--body-muted);margin-top:3px;">${sub}</div>`}
    </div>
  `;
}

export default function Performance() {
  const [tab, setTab] = useState('summary');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [branchData, setBranchData] = useState([]);
  const [tellerData, setTellerData] = useState([]);

  useEffect(() => { loadAll(); }, [days]);

  async function loadAll() {
    setLoading(true); setError('');
    try {
      const [s, b, t] = await Promise.all([
        api.performanceSummary({ days }),
        api.branchPerf({ days }),
        api.tellerPerf({ days }),
      ]);
      setSummary(s);
      setBranchData(Array.isArray(b) ? b : []);
      setTellerData(Array.isArray(t) ? t : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const branchAgg = (() => {
    const m = {};
    for (const r of branchData) {
      if (!m[r.branch_id]) m[r.branch_id] = { branch_name: r.branch_name, txn_count: 0, total_amount: 0, deposit_volume: 0, withdrawal_volume: 0 };
      m[r.branch_id].txn_count += r.txn_count || 0;
      m[r.branch_id].total_amount += r.total_amount || 0;
      m[r.branch_id].deposit_volume += r.deposit_volume || 0;
      m[r.branch_id].withdrawal_volume += r.withdrawal_volume || 0;
    }
    return Object.values(m).sort((a, b) => b.total_amount - a.total_amount);
  })();

  const tellerAgg = (() => {
    const m = {};
    for (const r of tellerData) {
      const k = r.user_id || r.username;
      if (!m[k]) m[k] = { username: r.username, branch_name: r.branch_name, txn_count: 0, total_amount: 0, deposits: 0, withdrawals: 0, transfers: 0 };
      m[k].txn_count += r.txn_count || 0;
      m[k].total_amount += r.total_amount || 0;
      m[k].deposits += r.deposits || 0;
      m[k].withdrawals += r.withdrawals || 0;
      m[k].transfers += r.transfers || 0;
    }
    return Object.values(m).sort((a, b) => b.txn_count - a.txn_count);
  })();

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Performance</span>
        <div className="topbar-right">
          <select className="form-input" style="width:150px;font-size:12px;height:30px;padding:0 8px;"
            value=${days} onChange=${e => setDays(Number(e.target.value))}>
            ${DAYS_OPTS.map(o => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
          </select>
        </div>
      </header>

      <div className="page">
        ${error && html`<div className="alert alert-danger">${error}</div>`}

        <div className="tab-bar" style="margin-bottom:16px;">
          ${TABS.map(t => html`
            <button key=${t} className=${'tab-btn' + (tab === t ? ' active' : '')}
              onClick=${() => setTab(t)} style="text-transform:capitalize;">
              ${t === 'summary' ? 'Summary' : t === 'branch' ? 'By Branch' : 'By Teller'}
            </button>
          `)}
        </div>

        ${loading ? html`<div style="padding:60px;text-align:center;"><${Spinner} large /></div>` : html`
          ${tab === 'summary' && summary && html`
            <div>
              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
                <${KpiCard} label="Total transactions" value=${fmt.num(summary.summary?.txn_count || 0)} />
                <${KpiCard} label="Total volume" value=${fmt.currency(summary.summary?.total_volume || 0)} />
                <${KpiCard} label="Active accounts" value=${fmt.num(summary.summary?.active_accounts || 0)} />
                <${KpiCard} label="Avg transaction" value=${fmt.currency(summary.summary?.avg_txn_amount || 0)} />
              </div>

              <div className="tbl-wrap">
                <div className="tbl-head"><span className="tbl-head-title">Volume by branch</span></div>
                ${summary.by_branch?.length ? html`
                  <table>
                    <thead><tr><th>Branch</th><th>Transactions</th><th>Total volume</th></tr></thead>
                    <tbody>
                      ${summary.by_branch.map((b, i) => html`
                        <tr key=${i}>
                          <td>${b.BranchName || b.branch_name}</td>
                          <td>${fmt.num(b.txn_count)}</td>
                          <td style="color:var(--blue-90);font-weight:500;">${fmt.currency(b.total_amount)}</td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                ` : html`<div className="empty-state" style="padding:24px 0;"><div className="empty-state-title">No data</div></div>`}
              </div>
            </div>
          `}

          ${tab === 'branch' && html`
            <div className="tbl-wrap">
              <div className="tbl-head"><span className="tbl-head-title">Branch performance (${days}d)</span></div>
              ${branchAgg.length ? html`
                <table>
                  <thead>
                    <tr>
                      <th>Branch</th><th>Transactions</th><th>Total volume</th>
                      <th>Deposits</th><th>Withdrawals</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${branchAgg.map((b, i) => html`
                      <tr key=${i}>
                        <td style="font-weight:500;">${b.branch_name}</td>
                        <td>${fmt.num(b.txn_count)}</td>
                        <td style="color:var(--blue-90);font-weight:500;">${fmt.currency(b.total_amount)}</td>
                        <td class="amount-pos">${fmt.currency(b.deposit_volume)}</td>
                        <td class="amount-neg">${fmt.currency(b.withdrawal_volume)}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              ` : html`
                <div className="empty-state" style="padding:24px 0;">
                  <div className="empty-state-title">No branch data</div>
                  <div className="empty-state-text">No transactions in the selected period.</div>
                </div>
              `}
            </div>
          `}

          ${tab === 'teller' && html`
            <div className="tbl-wrap">
              <div className="tbl-head"><span className="tbl-head-title">Teller productivity (${days}d)</span></div>
              ${tellerAgg.length ? html`
                <table>
                  <thead>
                    <tr>
                      <th>Teller</th><th>Branch</th><th>Transactions</th><th>Volume</th>
                      <th>Deposits</th><th>Withdrawals</th><th>Transfers</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tellerAgg.map((t, i) => html`
                      <tr key=${i}>
                        <td style="font-weight:500;">${t.username || '—'}</td>
                        <td style="color:var(--body-muted);font-size:12px;">${t.branch_name}</td>
                        <td>${fmt.num(t.txn_count)}</td>
                        <td style="color:var(--blue-90);font-weight:500;">${fmt.currency(t.total_amount)}</td>
                        <td style="font-size:12px;">${fmt.num(t.deposits)}</td>
                        <td style="font-size:12px;">${fmt.num(t.withdrawals)}</td>
                        <td style="font-size:12px;">${fmt.num(t.transfers)}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              ` : html`
                <div className="empty-state" style="padding:24px 0;">
                  <div className="empty-state-title">No teller data</div>
                  <div className="empty-state-text">Teller data requires active teller sessions.</div>
                </div>
              `}
            </div>
          `}
        `}
      </div>
    </>
  `;
}
