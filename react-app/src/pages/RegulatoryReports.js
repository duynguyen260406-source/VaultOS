import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext.js';
import { api, API } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import { Spinner } from '../components/Spinner.js';

export default function RegulatoryReports() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [t, r] = await Promise.all([api.listRegTemplates(), api.listRegRuns()]);
      setTemplates(Array.isArray(t) ? t : []);
      setRuns(Array.isArray(r) ? r : []);
      if (t?.length && !selected) setSelected(t[0].code);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function handleRunJson() {
    if (!selected) return;
    setRunning(true); setPreview(null);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await api.runReportJson(selected, params);
      setPreview(res);
      load();
      toast.success(`Report run — ${res.row_count} rows`);
    } catch (e) { toast.error(e.message); }
    finally { setRunning(false); }
  }

  async function handleSignoff(runId) {
    try {
      await api.signoffRun(runId);
      toast.success('Report signed off.');
      load();
    } catch (e) { toast.error(e.message); }
  }

  const cols = preview?.data?.[0] ? Object.keys(preview.data[0]) : [];

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Regulatory Reports</span>
      </header>

      <div className="page">
        <div style="display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start;">

          <!-- Template selector -->
          <div className="card" style="padding:14px;">
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted-foreground);margin-bottom:10px;">Templates</div>
            ${loading ? html`<${Spinner} />` : templates.map(t => html`
              <button key=${t.code}
                onClick=${() => { setSelected(t.code); setPreview(null); }}
                style="display:block;width:100%;text-align:left;padding:8px 10px;border-radius:6px;border:1px solid ${selected === t.code ? 'var(--blue-90)' : 'transparent'};background:${selected === t.code ? 'var(--blue-12)' : 'transparent'};margin-bottom:4px;cursor:pointer;">
                <div style="font-size:12px;font-weight:600;color:${selected === t.code ? 'var(--blue-90)' : 'var(--foreground)'};">${t.code}</div>
                <div style="font-size:11px;color:var(--muted-foreground);margin-top:1px;">${t.name}</div>
              </button>
            `)}
          </div>

          <!-- Run panel -->
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div className="card" style="padding:14px;">
              <div style="font-size:13px;font-weight:600;margin-bottom:10px;">Run: ${selected || '—'}</div>
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
                <button className="btn btn-primary btn-sm" onClick=${handleRunJson} disabled=${running || !selected}>
                  ${running ? html`<${Spinner} />` : 'Run (preview)'}
                </button>
              </div>
            </div>

            ${preview && html`
              <div className="tbl-wrap">
                <div className="tbl-head">
                  <span className="tbl-head-title">Results — ${preview.row_count} rows (run #${preview.run_id})</span>
                </div>
                ${preview.row_count === 0 ? html`
                  <div className="empty-state" style="padding:24px 0;">
                    <div className="empty-state-title">No data</div>
                    <div className="empty-state-text">No records match the selected parameters.</div>
                  </div>
                ` : html`
                  <div style="overflow-x:auto;">
                    <table>
                      <thead><tr>${cols.map(c => html`<th key=${c} style="font-size:11px;">${c}</th>`)}</tr></thead>
                      <tbody>
                        ${preview.data.slice(0, 100).map((row, i) => html`
                          <tr key=${i}>
                            ${cols.map(c => html`<td key=${c} style="font-size:12px;">${row[c] ?? '—'}</td>`)}
                          </tr>
                        `)}
                      </tbody>
                    </table>
                    ${preview.row_count > 100 && html`<p style="padding:8px 12px;font-size:12px;color:var(--muted-foreground);">Showing first 100 of ${preview.row_count} rows.</p>`}
                  </div>
                `}
              </div>
            `}

            <div className="tbl-wrap">
              <div className="tbl-head"><span className="tbl-head-title">Recent runs</span></div>
              ${runs.length ? html`
                <table>
                  <thead><tr><th>#</th><th>Template</th><th>Format</th><th>Rows</th><th>Generated</th><th>By</th><th>Sign-off</th><th></th></tr></thead>
                  <tbody>
                    ${runs.map(r => html`
                      <tr key=${r.run_id}>
                        <td style="font-family:monospace;font-size:12px;">#${r.run_id}</td>
                        <td style="font-size:12px;">${r.code}</td>
                        <td style="font-size:11px;color:var(--muted-foreground);">${r.output_format}</td>
                        <td style="font-size:12px;">${r.row_count}</td>
                        <td style="font-size:12px;color:var(--body-muted);">${fmt.datetime(r.generated_at)}</td>
                        <td style="font-size:12px;">${r.run_by_username || '—'}</td>
                        <td style="font-size:12px;">${r.signed_off_by_username ? html`<span style="color:#7adf2e;">✓ ${r.signed_off_by_username}</span>` : html`<span style="color:var(--muted-foreground);">Pending</span>`}</td>
                        <td>
                          ${!r.signed_off_by_username && html`
                            <button className="btn btn-ghost btn-sm" onClick=${() => handleSignoff(r.run_id)}>Sign off</button>
                          `}
                        </td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              ` : html`
                <div className="empty-state" style="padding:24px 0;">
                  <div className="empty-state-title">No runs yet</div>
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    </>
  `;
}
