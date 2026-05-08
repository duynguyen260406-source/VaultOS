import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import { Spinner } from '../components/Spinner.js';

const TEMPLATE_DESC = {
  CTR_DAILY:     'Cash transactions ≥ 200M VND',
  STR_MONTHLY:   'Suspicious activity rollup',
  LOAN_SUMMARY:  'Loan portfolio by branch',
  BALANCE_SHEET: 'Assets & liabilities by branch',
};

export default function RegulatoryReports() {
  const toast = useToast();
  const [templates, setTemplates]         = useState([]);
  const [runs, setRuns]                   = useState([]);
  const [initLoading, setInitLoading]     = useState(true);
  const [runsLoading, setRunsLoading]     = useState(false);
  const [selected, setSelected]           = useState(null);
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [running, setRunning]             = useState(false);
  const [preview, setPreview]             = useState(null);

  useEffect(() => {
    (async () => {
      setInitLoading(true);
      try {
        const [t, r] = await Promise.all([api.listRegTemplates(), api.listRegRuns()]);
        const tArr = Array.isArray(t) ? t : [];
        setTemplates(tArr);
        setRuns(Array.isArray(r) ? r : []);
        if (tArr.length) setSelected(tArr[0].code);
      } catch (e) { toast.error(e.message); }
      finally { setInitLoading(false); }
    })();
  }, []);

  async function loadRuns() {
    setRunsLoading(true);
    try {
      const r = await api.listRegRuns();
      setRuns(Array.isArray(r) ? r : []);
    } catch (e) { toast.error(e.message); }
    finally { setRunsLoading(false); }
  }

  async function handleRun() {
    if (!selected) return;
    setRunning(true); setPreview(null);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const res = await api.runReportJson(selected, params);
      setPreview(res);
      await loadRuns();
      toast.success(`Report complete — ${res.row_count} rows`);
    } catch (e) { toast.error(e.message); }
    finally { setRunning(false); }
  }

  async function handleSignoff(runId) {
    try {
      await api.signoffRun(runId);
      toast.success('Report signed off');
      await loadRuns();
    } catch (e) { toast.error(e.message); }
  }

  async function handleVoid(runId) {
    if (!confirm('Void this report run? This cannot be undone.')) return;
    try {
      await api.voidRun(runId);
      toast.success('Report voided');
      setPreview(p => (p?.run_id === runId ? null : p));
      await loadRuns();
    } catch (e) { toast.error(e.message); }
  }

  const cols = preview?.data?.[0] ? Object.keys(preview.data[0]) : [];
  const selectedTpl = templates.find(t => t.code === selected);

  return html`
    <>
      <style>${`
        .reg-tpl-btn { transition: background .12s, border-color .12s; }
        .reg-tpl-btn:hover { background: rgba(255,255,255,.04) !important; }
      `}</style>

      <header className="topbar">
        <span className="topbar-title">Regulatory Reports</span>
      </header>

      <div className="page">
        <div style="display:grid;grid-template-columns:240px 1fr;gap:16px;align-items:start;">

          <!-- Template list -->
          <div className="card" style="padding:0;overflow:hidden;">
            <div style="padding:12px 14px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--muted-foreground);">
              Templates
            </div>
            ${initLoading
              ? html`<div style="padding:20px;text-align:center;"><${Spinner} /></div>`
              : templates.map(t => html`
                <button key=${t.code}
                  className="reg-tpl-btn"
                  onClick=${() => { setSelected(t.code); setPreview(null); }}
                  style=${{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 14px',
                    borderLeft: `3px solid ${selected === t.code ? 'var(--blue-90)' : 'transparent'}`,
                    background: selected === t.code ? 'rgba(96,165,250,.08)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}>
                  <div style=${{ fontSize: 12, fontWeight: 600, color: selected === t.code ? 'var(--blue-90)' : 'var(--foreground)', marginBottom: 2 }}>
                    ${t.name}
                  </div>
                  <div style=${{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                    ${TEMPLATE_DESC[t.code] || t.description || ''}
                  </div>
                </button>
              `)
            }
          </div>

          <!-- Right panel -->
          <div style="display:flex;flex-direction:column;gap:14px;">

            <!-- Run controls -->
            <div className="card" style="padding:16px;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-foreground);margin-bottom:12px;">
                Run Report
              </div>
              ${selected && html`
                <div style="font-size:14px;font-weight:600;color:var(--foreground);margin-bottom:12px;">
                  ${selectedTpl?.name || selected}
                </div>
              `}
              <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
                <div className="form-group" style="margin:0;">
                  <label className="form-label" style="font-size:11px;">From date</label>
                  <input type="date" className="form-input" style="font-size:12px;"
                    value=${dateFrom} onChange=${e => setDateFrom(e.target.value)} />
                </div>
                <div className="form-group" style="margin:0;">
                  <label className="form-label" style="font-size:11px;">To date</label>
                  <input type="date" className="form-input" style="font-size:12px;"
                    value=${dateTo} onChange=${e => setDateTo(e.target.value)} />
                </div>
                <button className="btn btn-primary btn-sm" onClick=${handleRun}
                  disabled=${running || !selected}
                  style="display:flex;align-items:center;gap:6px;">
                  ${running ? html`<${Spinner} size=${12} /> Running…` : html`
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Run
                  `}
                </button>
              </div>
            </div>

            <!-- Preview results -->
            ${preview && html`
              <div className="card" style="padding:0;overflow:hidden;">
                <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
                  <span style="font-size:12px;font-weight:600;">
                    Results — <span style="color:var(--blue-90);">${preview.row_count} rows</span>
                    <span style="font-size:11px;color:var(--muted-foreground);font-weight:400;margin-left:8px;">Run #${preview.run_id}</span>
                  </span>
                  <button onClick=${() => setPreview(null)}
                    style="background:none;border:none;cursor:pointer;color:var(--muted-foreground);padding:2px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                ${preview.row_count === 0
                  ? html`<div style="padding:32px;text-align:center;color:var(--muted-foreground);font-size:13px;">No data for selected parameters.</div>`
                  : html`
                    <div style="overflow-x:auto;">
                      <table>
                        <thead>
                          <tr>${cols.map(c => html`<th key=${c} style="font-size:11px;">${c}</th>`)}</tr>
                        </thead>
                        <tbody>
                          ${preview.data.slice(0, 100).map((row, i) => html`
                            <tr key=${i}>
                              ${cols.map(c => html`<td key=${c} style="font-size:12px;">${row[c] ?? '—'}</td>`)}
                            </tr>
                          `)}
                        </tbody>
                      </table>
                      ${preview.row_count > 100 && html`
                        <div style="padding:8px 14px;font-size:11px;color:var(--muted-foreground);border-top:1px solid var(--border);">
                          Showing first 100 of ${preview.row_count} rows
                        </div>
                      `}
                    </div>
                  `}
              </div>
            `}

            <!-- Recent runs -->
            <div className="card" style="padding:0;overflow:hidden;">
              <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:12px;font-weight:600;">Recent Runs</span>
                ${runsLoading && html`<${Spinner} size=${14} />`}
              </div>
              ${runs.length === 0 && !runsLoading
                ? html`<div style="padding:32px;text-align:center;color:var(--muted-foreground);font-size:13px;">No reports generated yet.</div>`
                : html`
                  <div style="overflow-x:auto;">
                    <table>
                      <thead>
                        <tr>
                          <th style="font-size:10px;width:50px;">#</th>
                          <th style="font-size:10px;">Template</th>
                          <th style="font-size:10px;">Rows</th>
                          <th style="font-size:10px;">Generated</th>
                          <th style="font-size:10px;">By</th>
                          <th style="font-size:10px;">Status</th>
                          <th style="font-size:10px;width:160px;"></th>
                        </tr>
                      </thead>
                      <tbody>
                        ${runs.map(r => html`
                          <tr key=${r.run_id}>
                            <td style="font-family:monospace;font-size:11px;color:var(--muted-foreground);">#${r.run_id}</td>
                            <td style="font-size:12px;font-weight:500;">${r.template_name || r.code}</td>
                            <td style="font-size:12px;font-variant-numeric:tabular-nums;">${r.row_count}</td>
                            <td style="font-size:12px;color:var(--muted-foreground);">${fmt.datetime(r.generated_at)}</td>
                            <td style="font-size:12px;">${r.run_by_username || '—'}</td>
                            <td>
                              ${r.signed_off_by_username
                                ? html`
                                  <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#22c55e;">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                    ${r.signed_off_by_username}
                                  </span>`
                                : html`<span style="font-size:11px;color:var(--muted-foreground);">Awaiting sign-off</span>`
                              }
                            </td>
                            <td style="text-align:right;">
                              <div style="display:flex;gap:6px;justify-content:flex-end;">
                                ${!r.signed_off_by_username && html`
                                  <button className="btn btn-ghost btn-sm"
                                    style="font-size:11px;color:#22c55e;"
                                    onClick=${() => handleSignoff(r.run_id)}>Sign off</button>
                                  <button className="btn btn-ghost btn-sm"
                                    style="font-size:11px;color:#ef4444;"
                                    onClick=${() => handleVoid(r.run_id)}>Void</button>
                                `}
                              </div>
                            </td>
                          </tr>
                        `)}
                      </tbody>
                    </table>
                  </div>
                `}
            </div>
          </div>
        </div>
      </div>
    </>
  `;
}
