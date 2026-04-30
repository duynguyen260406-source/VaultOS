import { html } from '../lib/html.js';
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import { Spinner, LoadingRow } from '../components/Spinner.js';
import Chart from 'chart.js/auto';

// ─── constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const ACTION_COLOR  = { INSERT: 'badge-green', UPDATE: 'badge-blue', DELETE: 'badge-red' };
const ACTION_BG     = { INSERT: 'rgba(34,197,94,.15)', UPDATE: 'rgba(145,197,255,.15)', DELETE: 'rgba(239,68,68,.15)' };
const ACTION_BORDER = { INSERT: '#22c55e', UPDATE: '#91c5ff', DELETE: '#ef4444' };

// ─── helpers ─────────────────────────────────────────────────────────────────

function exportCSV(headers, rows, filename) {
  const dq = '"';
  const escape = v => {
    const s = String(v ?? '');
    return (s.includes(',') || s.includes(dq)) ? dq + s.split(dq).join(dq + dq) + dq : s;
  };
  const blob = new Blob([[headers, ...rows].map(r => r.map(escape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

// ─── ChartCanvas ─────────────────────────────────────────────────────────────

function ChartCanvas({ config, height = 220 }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !config) return;
    if (!chartRef.current) {
      chartRef.current = new Chart(canvasRef.current, config);
    } else {
      chartRef.current.data = config.data;
      chartRef.current.update('none');
    }
  }, [config]);

  return html`<div style=${{ position:'relative', width:'100%', height:`${height}px` }}><canvas ref=${canvasRef} /></div>`;
}

const CHART_OPTS = {
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 500 },
  plugins: {
    legend: { labels: { color:'#a1a1a1', font:{ size:11 }, boxWidth:12, padding:14 } },
    tooltip: { backgroundColor:'#111', titleColor:'#fafafa', bodyColor:'#a1a1a1', borderColor:'#262626', borderWidth:1, padding:10 },
  },
  scales: {
    x: { ticks:{ color:'#525252', font:{ size:11 } }, grid:{ color:'#1a1a1a' }, border:{ color:'#262626' } },
    y: { ticks:{ color:'#525252', font:{ size:11 } }, grid:{ color:'#1a1a1a' }, border:{ color:'#262626' } },
  },
};

// ─── KPI ─────────────────────────────────────────────────────────────────────

function KPI({ label, value, accent = 'var(--foreground)', sub }) {
  return html`
    <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 18px', flex:1, minWidth:130 }}>
      <div style=${{ fontSize:11, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>${label}</div>
      <div style=${{ fontSize:22, fontWeight:700, color:accent, lineHeight:1.15 }}>${value}</div>
      ${sub && html`<div style=${{ fontSize:11, color:'var(--muted-foreground)', marginTop:3 }}>${sub}</div>`}
    </div>
  `;
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return html`
    <div onClick=${e => { if (e.target === e.currentTarget) onClose(); }}
      style=${{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:1000,
                display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12,
                    width:'100%', maxWidth:560, maxHeight:'82vh',
                    display:'flex', flexDirection:'column', overflow:'hidden',
                    boxShadow:'0 32px 80px rgba(0,0,0,.7)' }}>
        <div style=${{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'13px 18px', borderBottom:'1px solid var(--border)',
                      flexShrink:0, background:'rgba(255,255,255,.02)' }}>
          <span style=${{ fontSize:13, fontWeight:600, color:'var(--foreground)' }}>${title}</span>
          <button onClick=${onClose}
            style=${{ background:'none', border:'none', cursor:'pointer',
                      color:'var(--muted-foreground)', display:'flex', alignItems:'center', padding:6, borderRadius:5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div style=${{ overflowY:'auto', flex:1 }}>${children}</div>
      </div>
    </div>
  `;
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

function ConfirmModal({ title, message, onConfirm, onCancel, confirming }) {
  const [input, setInput] = useState('');
  const ok = input.trim() === 'AGREE';
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !confirming) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, confirming]);
  return html`
    <div onClick=${e => { if (e.target === e.currentTarget && !confirming) onCancel(); }}
      style=${{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:1010,
                display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12,
                    width:'100%', maxWidth:420, boxShadow:'0 32px 80px rgba(0,0,0,.8)' }}>
        <div style=${{ padding:'16px 20px', borderBottom:'1px solid var(--border)' }}>
          <div style=${{ fontSize:14, fontWeight:700, color:'var(--foreground)' }}>${title}</div>
        </div>
        <div style=${{ padding:'18px 20px' }}>
          <p style=${{ fontSize:13, color:'var(--muted-foreground)', marginBottom:18, lineHeight:1.6 }}>${message}</p>
          <div style=${{ fontSize:12, color:'var(--muted-foreground)', marginBottom:6 }}>
            Type <strong style=${{ color:'var(--foreground)', letterSpacing:'.05em' }}>AGREE</strong> to confirm:
          </div>
          <input className="form-input" value=${input} autoFocus
            onChange=${e => setInput(e.target.value)}
            onKeyDown=${e => e.key === 'Enter' && ok && !confirming && onConfirm()}
            placeholder="AGREE"
            style=${{ width:'100%', marginBottom:18, fontSize:13 }} />
          <div style=${{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button className="btn btn-secondary" onClick=${onCancel} disabled=${confirming}>Cancel</button>
            <button className="btn btn-primary" onClick=${onConfirm} disabled=${!ok || confirming}
              style=${{ minWidth:90, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              ${confirming ? html`<${Spinner} />` : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── SuspiciousTab ────────────────────────────────────────────────────────────

const WINDOWS = [
  { label: '7 days',  days: 7  },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

function buildDayRange(days) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

function dateOf(r) {
  const raw = r.transaction_date || r.created_at || r.flagged_at || '';
  return raw.slice(0, 10);
}

function SuspiciousTab() {
  const toast = useToast();
  const [filter,        setFilter]        = useState('');
  const [rows,          setRows]          = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [winDays,       setWinDays]       = useState(14);
  // detail modal
  const [selectedAlert, setSelectedAlert] = useState(null);
  // confirm modal: { id, reviewed, label }
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirming,    setConfirming]    = useState(false);

  useEffect(() => { load(''); }, []);

  async function load(f = filter) {
    setLoading(true);
    try {
      const params = {};
      if (f !== '') params.reviewed = f;
      const data = await api.getSuspiciousActivities(params);
      setRows(data.items || data.activities || data || []);
    } catch (e) { setRows([]); toast.error(e.message); }
    finally { setLoading(false); }
  }

  function openConfirm(id, newReviewed) {
    const label = newReviewed ? 'Mark as Reviewed' : 'Mark as Unreviewed';
    setConfirmAction({ id, reviewed: newReviewed, label });
  }

  async function executeAction() {
    if (!confirmAction) return;
    const { id, reviewed: newReviewed } = confirmAction;
    setConfirming(true);
    setConfirmAction(null);
    // Optimistic: move the row immediately
    setRows(prev => (prev || []).map(r =>
      (r.alert_id || r.id) === id ? { ...r, reviewed: newReviewed } : r
    ));
    setSelectedAlert(prev => prev && (prev.alert_id || prev.id) === id
      ? { ...prev, reviewed: newReviewed } : prev
    );
    try {
      await api.markReviewed(id, newReviewed);
      toast.success(`Alert #${id} marked as ${newReviewed ? 'reviewed' : 'unreviewed'}.`);
    } catch (e) {
      toast.error(e.message);
      // Revert optimistic update on failure
      setRows(prev => (prev || []).map(r =>
        (r.alert_id || r.id) === id ? { ...r, reviewed: !newReviewed } : r
      ));
    } finally { setConfirming(false); }
  }

  const all        = rows || [];
  const unreviewed = all.filter(r => !(r.reviewed === true || r.reviewed === 1));
  const reviewed   = all.filter(r =>  (r.reviewed === true || r.reviewed === 1));
  const totalAmt   = all.reduce((s, r) => s + (r.amount || r.transaction_amount || 0), 0);
  const maxAmt     = all.length ? Math.max(...all.map(r => r.amount || r.transaction_amount || 0)) : 0;

  const days = buildDayRange(winDays);
  const dayMap = all.reduce((acc, r) => {
    const d = dateOf(r);
    if (!acc[d]) acc[d] = { count: 0, unreviewed: 0 };
    acc[d].count++;
    if (!(r.reviewed === true || r.reviewed === 1)) acc[d].unreviewed++;
    return acc;
  }, {});

  const lineConfig = all.length ? {
    type: 'line',
    data: {
      labels: days.map(d => new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })),
      datasets: [
        { label: 'Total flagged', data: days.map(d => dayMap[d]?.count || 0),
          borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.08)',
          borderWidth:2, pointRadius:3, pointHoverRadius:5, tension:0.35, fill:true },
        { label: 'Unreviewed', data: days.map(d => dayMap[d]?.unreviewed || 0),
          borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,.06)',
          borderWidth:1.5, pointRadius:2, pointHoverRadius:4,
          tension:0.35, fill:false, borderDash:[4,3] },
      ],
    },
    options: {
      ...CHART_OPTS, interaction:{ mode:'index', intersect:false },
      scales: {
        x: { ...CHART_OPTS.scales.x },
        y: { ...CHART_OPTS.scales.y, beginAtZero:true, ticks:{ ...CHART_OPTS.scales.y.ticks, precision:0 } },
      },
    },
  } : null;

  const handleExport = () => {
    if (!all.length) return;
    exportCSV(
      ['Alert ID', 'Account', 'Amount (VND)', 'Date', 'Reason', 'Status'],
      all.map(r => [
        r.alert_id || r.id, r.account_number || r.account_id,
        r.amount || r.transaction_amount,
        r.transaction_date || r.created_at || r.flagged_at,
        r.reason || '',
        (r.reviewed === true || r.reviewed === 1) ? 'Reviewed' : 'Unreviewed',
      ]), 'suspicious-activities.csv');
  };

  // keep selectedAlert fresh when rows reload
  const selectedFresh = selectedAlert
    ? (all.find(r => (r.alert_id || r.id) === (selectedAlert.alert_id || selectedAlert.id)) || selectedAlert)
    : null;

  return html`
    <div>
      <div className="alert alert-warning" style=${{ marginBottom:16, display:'flex', alignItems:'flex-start', gap:8 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style=${{ flexShrink:0, marginTop:1 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>Transactions ≥ 50,000,000 VND are automatically flagged. Review and mark each alert once verified.</span>
      </div>

      ${rows === null ? null : html`
        <div>
          <div style=${{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
            <${KPI} label="Total alerts"  value=${fmt.num(all.length)} />
            <${KPI} label="Unreviewed"    value=${fmt.num(unreviewed.length)} accent="#ef4444" />
            <${KPI} label="Reviewed"      value=${fmt.num(reviewed.length)}   accent="#22c55e" />
            <${KPI} label="Total flagged" value=${fmt.currency(totalAmt)}     accent="var(--chart-2)" />
            <${KPI} label="Largest alert" value=${fmt.currency(maxAmt)}       accent="#f59e0b" />
          </div>
          ${!lineConfig ? null : html`
            <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:14 }}>
              <div style=${{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
                <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'.06em' }}>
                  Flagged transactions over time
                </div>
                <div style=${{ display:'flex', gap:4 }}>
                  ${WINDOWS.map(w => html`
                    <button key=${w.days} onClick=${() => setWinDays(w.days)}
                      style=${{
                        fontSize:11, padding:'3px 10px', borderRadius:5, cursor:'pointer', border:'1px solid',
                        borderColor: winDays === w.days ? '#ef4444' : 'var(--border)',
                        background:  winDays === w.days ? 'rgba(239,68,68,.15)' : 'var(--muted)',
                        color:       winDays === w.days ? '#ef4444' : 'var(--muted-foreground)',
                      }}>
                      ${w.label}
                    </button>
                  `)}
                </div>
              </div>
              <${ChartCanvas} key=${`sa-line-${winDays}-${all.length}`} config=${lineConfig} height=${200} />
            </div>
          `}
        </div>
      `}

      <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, gap:8, flexWrap:'wrap' }}>
        <span style=${{ fontSize:12, color:'var(--muted-foreground)' }}>
          ${all.length} total alert(s) — click any row for details
        </span>
        <div style=${{ display:'flex', gap:6 }}>
          <button className="btn btn-secondary btn-sm" onClick=${() => load()}>Refresh</button>
          ${all.length > 0 ? html`
            <button className="btn btn-sm" onClick=${handleExport}
              style=${{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, padding:'4px 10px',
                        background:'var(--muted)', border:'1px solid var(--border)', borderRadius:6,
                        color:'var(--muted-foreground)', cursor:'pointer' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export CSV
            </button>
          ` : null}
        </div>
      </div>

      <div style=${{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, alignItems:'start' }}>

        <div className="tbl-wrap">
          <div className="tbl-head" style=${{ borderLeft:'3px solid #ef4444' }}>
            <span className="tbl-head-title" style=${{ color:'#ef4444' }}>
              Unreviewed
              <span style=${{ marginLeft:8, fontSize:12, fontWeight:400, color:'var(--muted-foreground)' }}>${unreviewed.length}</span>
            </span>
          </div>
          <table>
            <thead><tr><th>ID</th><th>Account</th><th>Amount</th><th>Date</th><th></th></tr></thead>
            <tbody>
              ${loading
                ? html`<${LoadingRow} cols=${5} />`
                : unreviewed.length === 0
                  ? html`<tr><td colSpan="5">
                      <div className="empty-state" style=${{ padding:'28px 0' }}>
                        <div style=${{ fontSize:22, marginBottom:6 }}>✓</div>
                        <div className="empty-state-title" style=${{ color:'#22c55e' }}>All clear</div>
                        <div className="empty-state-text">No unreviewed alerts.</div>
                      </div>
                    </td></tr>`
                  : unreviewed.map(r => {
                      const id = r.alert_id || r.id;
                      const amt = r.amount || r.transaction_amount || 0;
                      const isSelected = (selectedFresh?.alert_id || selectedFresh?.id) === id;
                      return html`
                        <tr key=${id} className="clickable"
                          onClick=${() => setSelectedAlert(r)}
                          style=${{ background: isSelected ? 'rgba(239,68,68,.07)' : '' }}>
                          <td style=${{ fontSize:11, color:'var(--muted-foreground)', whiteSpace:'nowrap' }}>#${id}</td>
                          <td style=${{ fontFamily:'monospace', fontSize:11 }}>${r.account_number || r.account_id}</td>
                          <td style=${{ color:'#ef4444', fontWeight:600, fontVariantNumeric:'tabular-nums', fontSize:12 }}>${fmt.currency(amt)}</td>
                          <td style=${{ fontSize:11, color:'var(--muted-foreground)', whiteSpace:'nowrap' }}>${fmt.datetime(r.transaction_date || r.created_at)}</td>
                          <td onClick=${e => e.stopPropagation()} style=${{ whiteSpace:'nowrap' }}>
                            <button className="btn btn-primary btn-sm" style=${{ fontSize:11 }}
                              onClick=${() => openConfirm(id, true)}>
                              → Reviewed
                            </button>
                          </td>
                        </tr>`;
                    })
              }
            </tbody>
          </table>
          ${!loading && unreviewed.length > 0 ? html`
            <div className="tbl-foot"><span>${unreviewed.length} alert(s)</span></div>
          ` : null}
        </div>

        <div className="tbl-wrap">
          <div className="tbl-head" style=${{ borderLeft:'3px solid #22c55e' }}>
            <span className="tbl-head-title" style=${{ color:'#22c55e' }}>
              Reviewed
              <span style=${{ marginLeft:8, fontSize:12, fontWeight:400, color:'var(--muted-foreground)' }}>${reviewed.length}</span>
            </span>
          </div>
          <table>
            <thead><tr><th>ID</th><th>Account</th><th>Amount</th><th>Date</th><th></th></tr></thead>
            <tbody>
              ${loading
                ? html`<${LoadingRow} cols=${5} />`
                : reviewed.length === 0
                  ? html`<tr><td colSpan="5">
                      <div className="empty-state" style=${{ padding:'28px 0' }}>
                        <div className="empty-state-title">No reviewed alerts</div>
                        <div className="empty-state-text">Mark alerts as reviewed to see them here.</div>
                      </div>
                    </td></tr>`
                  : reviewed.map(r => {
                      const id = r.alert_id || r.id;
                      const amt = r.amount || r.transaction_amount || 0;
                      const isSelected = (selectedFresh?.alert_id || selectedFresh?.id) === id;
                      return html`
                        <tr key=${id} className="clickable"
                          onClick=${() => setSelectedAlert(r)}
                          style=${{ background: isSelected ? 'rgba(34,197,94,.05)' : '' }}>
                          <td style=${{ fontSize:11, color:'var(--muted-foreground)', whiteSpace:'nowrap' }}>#${id}</td>
                          <td style=${{ fontFamily:'monospace', fontSize:11 }}>${r.account_number || r.account_id}</td>
                          <td style=${{ color:'#ef4444', fontWeight:600, fontVariantNumeric:'tabular-nums', fontSize:12 }}>${fmt.currency(amt)}</td>
                          <td style=${{ fontSize:11, color:'var(--muted-foreground)', whiteSpace:'nowrap' }}>${fmt.datetime(r.transaction_date || r.created_at)}</td>
                          <td onClick=${e => e.stopPropagation()} style=${{ whiteSpace:'nowrap' }}>
                            <button className="btn btn-secondary btn-sm"
                              style=${{ fontSize:11, color:'#f59e0b', borderColor:'rgba(245,158,11,.3)', background:'rgba(245,158,11,.08)' }}
                              onClick=${() => openConfirm(id, false)}>
                              ← Unreviewed
                            </button>
                          </td>
                        </tr>`;
                    })
              }
            </tbody>
          </table>
          ${!loading && reviewed.length > 0 ? html`
            <div className="tbl-foot"><span>${reviewed.length} alert(s)</span></div>
          ` : null}
        </div>

      </div>

      ${selectedFresh ? html`
        <${Modal}
          title=${'Alert #' + (selectedFresh.alert_id || selectedFresh.id)}
          onClose=${() => setSelectedAlert(null)}>
          <div style=${{ padding:'20px' }}>
            ${(() => {
              const id = selectedFresh.alert_id || selectedFresh.id;
              const isReviewed = selectedFresh.reviewed === true || selectedFresh.reviewed === 1;
              const amt = selectedFresh.amount || selectedFresh.transaction_amount || 0;
              return html`
                <div style=${{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
                  <div style=${{ background:'var(--muted)', borderRadius:8, padding:'12px 14px' }}>
                    <div style=${{ fontSize:11, color:'var(--muted-foreground)', marginBottom:4 }}>Account</div>
                    <div style=${{ fontSize:13, fontFamily:'monospace', fontWeight:500 }}>
                      ${selectedFresh.account_number || selectedFresh.account_id}
                    </div>
                  </div>
                  <div style=${{ background:'var(--muted)', borderRadius:8, padding:'12px 14px' }}>
                    <div style=${{ fontSize:11, color:'var(--muted-foreground)', marginBottom:4 }}>Amount flagged</div>
                    <div style=${{ fontSize:16, fontWeight:700, color:'#ef4444', fontVariantNumeric:'tabular-nums' }}>
                      ${fmt.currency(amt)}
                    </div>
                  </div>
                  <div style=${{ background:'var(--muted)', borderRadius:8, padding:'12px 14px' }}>
                    <div style=${{ fontSize:11, color:'var(--muted-foreground)', marginBottom:4 }}>Date</div>
                    <div style=${{ fontSize:13 }}>${fmt.datetime(selectedFresh.transaction_date || selectedFresh.created_at)}</div>
                  </div>
                  <div style=${{ background:'var(--muted)', borderRadius:8, padding:'12px 14px' }}>
                    <div style=${{ fontSize:11, color:'var(--muted-foreground)', marginBottom:4 }}>Status</div>
                    <div>${isReviewed
                      ? html`<span className="badge badge-green">Reviewed</span>`
                      : html`<span className="badge badge-red">Unreviewed</span>`
                    }</div>
                  </div>
                </div>

                ${selectedFresh.reason ? html`
                  <div style=${{ background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.2)', borderRadius:8, padding:'12px 14px', marginBottom:20 }}>
                    <div style=${{ fontSize:11, color:'#ef4444', marginBottom:4, textTransform:'uppercase', letterSpacing:'.06em' }}>
                      Flagged reason
                    </div>
                    <div style=${{ fontSize:13, color:'var(--foreground)', lineHeight:1.5 }}>${selectedFresh.reason}</div>
                  </div>
                ` : null}

                <div style=${{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4, borderTop:'1px solid var(--border)' }}>
                  ${selectedFresh.account_id ? html`
                    <${Link} to=${'/accounts/' + selectedFresh.account_id}
                      className="btn btn-secondary btn-sm"
                      onClick=${() => setSelectedAlert(null)}>
                      View account →
                    <//>
                  ` : null}
                  ${isReviewed
                    ? html`<button className="btn btn-secondary btn-sm"
                        style=${{ color:'#f59e0b', borderColor:'#f59e0b40', background:'rgba(245,158,11,.1)' }}
                        onClick=${() => { setSelectedAlert(null); openConfirm(id, false); }}>
                        Mark as Unreviewed
                      </button>`
                    : html`<button className="btn btn-primary btn-sm"
                        onClick=${() => { setSelectedAlert(null); openConfirm(id, true); }}>
                        Mark as Reviewed
                      </button>`
                  }
                </div>
              `;
            })()}
          </div>
        <//>
      ` : null}

      ${confirmAction ? html`
        <${ConfirmModal}
          title=${confirmAction.label}
          message=${confirmAction.reviewed
            ? 'You are about to mark this alert as Reviewed. This action will be recorded.'
            : 'You are about to revert this alert back to Unreviewed. This action will be recorded.'}
          onConfirm=${executeAction}
          onCancel=${() => setConfirmAction(null)}
          confirming=${confirming}
        />
      ` : null}
    </div>
  `;
}

// ─── AuditTab ─────────────────────────────────────────────────────────────────

function AuditTab() {
  const toast = useToast();
  const [actor,  setActor]  = useState('');
  const [table,  setTable]  = useState('');
  const [action, setAction] = useState('');
  const [from,   setFrom]   = useState('');
  const [to,     setTo]     = useState('');
  const [rows,   setRows]   = useState(null);
  const [total,  setTotal]  = useState(0);
  const [page,   setPage]   = useState(1);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  // summary stats (loaded once on mount)
  const [summary, setSummary]       = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => { loadSummary(); }, []);

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      setSummary(await api.getAuditLogSummary({ days: 14 }));
    } catch { setSummary({ total: 0, action_counts: {}, table_counts: {}, actor_counts: {}, daily_counts: {} }); }
    finally { setSummaryLoading(false); }
  }

  async function load(p = page, opts = {}) {
    setLoading(true);
    try {
      const a = opts.actor  !== undefined ? opts.actor  : actor;
      const t = opts.table  !== undefined ? opts.table  : table;
      const x = opts.action !== undefined ? opts.action : action;
      const f = opts.from   !== undefined ? opts.from   : from;
      const e = opts.to     !== undefined ? opts.to     : to;
      const params = {
        performed_by: a || null,
        table_name:   t || null,
        action_type:  x || null,
        date_from:    f || null,
        date_to:      e || null,
        page: p, page_size: PAGE_SIZE,
      };
      const data = await api.getAuditLogs(params);
      const r = data.items || data.logs || data || [];
      setRows(r); setTotal(data.total || r.length); setLoaded(true);
    } catch (e) { setRows([]); toast.error(e.message); }
    finally { setLoading(false); }
  }

  function search() { setPage(1); load(1); }
  function goPage(p) { setPage(p); load(p); }
  function reset() {
    setActor(''); setTable(''); setAction(''); setFrom(''); setTo('');
    setPage(1); setRows(null); setLoaded(false);
  }

  const pages = Math.ceil(total / PAGE_SIZE);

  // ── summary charts ──
  const actionCounts = summary?.action_counts || {};
  const tableCounts = summary?.table_counts || {};
  const actorCounts = summary?.actor_counts || {};
  const dailyMap = summary?.daily_counts || {};
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });

  const actionKeys  = Object.keys(actionCounts);
  const tableKeys   = Object.keys(tableCounts).sort((a, b) => tableCounts[b] - tableCounts[a]).slice(0, 8);
  const actorKeys   = Object.keys(actorCounts).sort((a, b) => actorCounts[b] - actorCounts[a]).slice(0, 8);

  const doughnutConfig = actionKeys.length ? {
    type: 'doughnut',
    data: {
      labels: actionKeys,
      datasets: [{
        data: actionKeys.map(k => actionCounts[k]),
        backgroundColor: actionKeys.map(k => ACTION_BG[k]     || 'rgba(161,161,161,.15)'),
        borderColor:     actionKeys.map(k => ACTION_BORDER[k] || '#a1a1a1'),
        borderWidth: 1.5, hoverOffset: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 500 },
      cutout: '64%',
      plugins: {
        legend: { position:'bottom', labels:{ color:'#a1a1a1', font:{ size:11 }, boxWidth:12, padding:14 } },
        tooltip: { backgroundColor:'#111', titleColor:'#fafafa', bodyColor:'#a1a1a1', borderColor:'#262626', borderWidth:1, padding:10 },
      },
    },
  } : null;

  const tableBarConfig = tableKeys.length ? {
    type: 'bar',
    data: {
      labels: tableKeys,
      datasets: [{
        label: 'Operations',
        data: tableKeys.map(k => tableCounts[k]),
        backgroundColor: 'rgba(145,197,255,.18)',
        borderColor: '#91c5ff',
        borderWidth: 1.5, borderRadius: 4,
      }],
    },
    options: {
      ...CHART_OPTS,
      indexAxis: 'y',
      plugins: { ...CHART_OPTS.plugins, legend: { display: false } },
    },
  } : null;

  const actorBarConfig = actorKeys.length ? {
    type: 'bar',
    data: {
      labels: actorKeys,
      datasets: [{
        label: 'Actions',
        data: actorKeys.map(k => actorCounts[k]),
        backgroundColor: 'rgba(245,158,11,.18)',
        borderColor: '#f59e0b',
        borderWidth: 1.5, borderRadius: 4,
      }],
    },
    options: {
      ...CHART_OPTS,
      plugins: { ...CHART_OPTS.plugins, legend: { display: false } },
    },
  } : null;

  const trendConfig = {
    type: 'line',
    data: {
      labels: last14.map(d => { const dt = new Date(d); return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }); }),
      datasets: [{
        label: 'Log entries',
        data: last14.map(d => dailyMap[d] || 0),
        borderColor: '#91c5ff',
        backgroundColor: 'rgba(145,197,255,.08)',
        borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.35, fill: true,
      }],
    },
    options: {
      ...CHART_OPTS,
      plugins: { ...CHART_OPTS.plugins, legend: { display: false } },
    },
  };

  const handleExport = () => {
    if (!rows?.length) return;
    exportCSV(
      ['Log ID', 'Table', 'Action', 'Actor', 'Record ID', 'Timestamp'],
      rows.map(r => [r.log_id || r.id, r.table_name, r.action_type, r.performed_by, r.record_id, r.performed_at || r.timestamp || r.created_at])
    , 'audit-logs.csv');
  };

  const totalOps = Object.values(actionCounts).reduce((a, b) => a + b, 0);

  return html`
    <div>
      ${summaryLoading
        ? html`<div style=${{ marginBottom:14 }}><${Spinner} /></div>`
        : !(summary && summary.total > 0) ? null : html`
        <div style=${{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
          <${KPI} label="Total ops (sample)" value=${fmt.num(totalOps)} />
          <${KPI} label="INSERT"  value=${fmt.num(actionCounts.INSERT  || 0)} accent="#22c55e" />
          <${KPI} label="UPDATE"  value=${fmt.num(actionCounts.UPDATE  || 0)} accent="#91c5ff" />
          <${KPI} label="DELETE"  value=${fmt.num(actionCounts.DELETE  || 0)} accent="#ef4444" />
          <${KPI} label="Actors"  value=${fmt.num(Object.keys(actorCounts).length)} accent="#f59e0b" />
        </div>

        <div style=${{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:14, marginBottom:14 }}>
          <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
            <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Action type mix</div>
            <${ChartCanvas} key="al-doughnut" config=${doughnutConfig} height=${200} />
          </div>
          <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
            <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Activity trend (14 days)</div>
            <${ChartCanvas} key="al-trend" config=${trendConfig} height=${200} />
          </div>
        </div>

        <div style=${{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:14, marginBottom:20 }}>
          <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
            <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Operations by table</div>
            <${ChartCanvas} key="al-table" config=${tableBarConfig} height=${200} />
          </div>
          <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
            <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Most active actors</div>
            <${ChartCanvas} key="al-actor" config=${actorBarConfig} height=${200} />
          </div>
        </div>
      `}

      <div className="tbl-wrap">
        <div className="tbl-head">
          <span className="tbl-head-title">Audit log search</span>
          <div className="filter-bar" style=${{ flexWrap:'wrap', gap:6 }}>
            <input type="text" className="form-input" placeholder="Actor / username..." value=${actor}
              onChange=${e => setActor(e.target.value)}
              onKeyDown=${e => e.key === 'Enter' && search()}
              style=${{ width:160, height:30, fontSize:12 }} />
            <select className="form-select" style=${{ width:140, height:30, fontSize:12 }} value=${table}
              onChange=${e => setTable(e.target.value)}>
              <option value="">All tables</option>
              <option>Customers</option><option>Accounts</option><option>Transactions</option>
              <option>Employees</option><option>AppUsers</option><option>Branches</option>
            </select>
            <select className="form-select" style=${{ width:120, height:30, fontSize:12 }} value=${action}
              onChange=${e => setAction(e.target.value)}>
              <option value="">All actions</option>
              <option>INSERT</option><option>UPDATE</option><option>DELETE</option>
            </select>
            <input type="date" className="form-input" style=${{ width:140, height:30, fontSize:12 }} value=${from}
              onChange=${e => setFrom(e.target.value)} title="From date" />
            <input type="date" className="form-input" style=${{ width:140, height:30, fontSize:12 }} value=${to}
              onChange=${e => setTo(e.target.value)} title="To date" />
            <button className="btn btn-primary btn-sm" onClick=${search}>Search</button>
            ${(actor || table || action || from || to) && html`
              <button className="btn btn-secondary btn-sm" onClick=${reset}>Clear</button>
            `}
            ${rows?.length > 0 && html`
              <button className="btn btn-sm" onClick=${handleExport}
                style=${{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, padding:'4px 10px',
                          background:'var(--muted)', border:'1px solid var(--border)', borderRadius:6,
                          color:'var(--muted-foreground)', cursor:'pointer' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export
              </button>
            `}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Table</th><th>Action</th><th>Actor</th>
              <th>Record ID</th><th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${loading
              ? html`<${LoadingRow} cols=${6} />`
              : !loaded
                ? html`<tr><td colSpan="6">
                    <div className="empty-state">
                      <div className="empty-icon-wrap">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                      </div>
                      <div className="empty-state-title">Search audit logs</div>
                      <div className="empty-state-text">Filter by actor, table, action type, or date range.</div>
                    </div>
                  </td></tr>`
                : rows?.length === 0
                  ? html`<tr><td colSpan="6">
                      <div className="empty-state">
                        <div className="empty-state-title">No logs found</div>
                        <div className="empty-state-text">Try adjusting your filters.</div>
                      </div>
                    </td></tr>`
                  : rows?.map(r => html`
                    <tr key=${r.log_id || r.id}>
                      <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>${r.log_id || r.id || '-'}</td>
                      <td style=${{ fontSize:12, fontWeight:500 }}>${r.table_name || '-'}</td>
                      <td><span className=${'badge ' + (ACTION_COLOR[r.action_type] || 'badge-gray')}>${r.action_type || '-'}</span></td>
                      <td style=${{ fontSize:12 }}>${r.performed_by || '-'}</td>
                      <td style=${{ fontSize:11, fontFamily:'monospace', color:'var(--muted-foreground)' }}>${r.record_id || '-'}</td>
                      <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>${fmt.datetime(r.performed_at || r.timestamp || r.created_at)}</td>
                    </tr>
                  `)
            }
          </tbody>
        </table>
        ${!loaded ? null : html`
          <div className="tbl-foot">
            <span>${fmt.num(total)} log entr${total === 1 ? 'y' : 'ies'}${pages > 1 ? ` — page ${page} of ${pages}` : ''}</span>
            ${pages <= 1 ? null : html`
              <div className="pg-btns">
                <button className="pg-btn" disabled=${page === 1} onClick=${() => goPage(page - 1)}>‹</button>
                ${Array.from({ length: Math.min(7, pages) }, (_, i) => {
                  const p = Math.max(1, Math.min(pages - 6, page - 3)) + i;
                  if (p > pages) return null;
                  return html`<button key=${p} className=${'pg-btn' + (p === page ? ' pg-active' : '')} onClick=${() => goPage(p)}>${p}</button>`;
                })}
                <button className="pg-btn" disabled=${page === pages} onClick=${() => goPage(page + 1)}>›</button>
              </div>
            `}
          </div>
        `}
      </div>
    </div>
  `;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Audit() {
  const [tab, setTab] = useState('suspicious');

  return html`
    <>
      <header className="topbar"><span className="topbar-title">Audit & Risk</span></header>
      <div className="page">
        <div className="tabs" style=${{ marginBottom:20 }}>
          <div className=${'tab' + (tab === 'suspicious' ? ' active' : '')} onClick=${() => setTab('suspicious')}>
            Suspicious Activity
          </div>
          <div className=${'tab' + (tab === 'audit' ? ' active' : '')} onClick=${() => setTab('audit')}>
            Audit Logs
          </div>
        </div>
        ${tab === 'suspicious' ? html`<${SuspiciousTab} />` : html`<${AuditTab} />`}
      </div>
    </>
  `;
}
