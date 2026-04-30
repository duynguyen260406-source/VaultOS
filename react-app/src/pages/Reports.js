import { html } from '../lib/html.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import { Spinner } from '../components/Spinner.js';
import Chart from 'chart.js/auto';

// ─── constants ───────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  deposit:    { bg: 'rgba(34,197,94,.18)',   border: '#22c55e' },
  withdrawal: { bg: 'rgba(239,68,68,.18)',   border: '#ef4444' },
  transfer:   { bg: 'rgba(145,197,255,.18)', border: '#91c5ff' },
};

function typeKey(t) {
  const s = (t ?? '').toLowerCase();
  if (s.startsWith('transfer')) return 'transfer';
  if (s.startsWith('withdraw')) return 'withdrawal';
  return s;
}

function mergeTransferRows(rows) {
  const merged = {};
  for (const row of rows) {
    const key = typeKey(row.transaction_type);
    const label = key === 'transfer' ? 'Transfer'
                : key === 'withdrawal' ? 'Withdrawal'
                : key === 'deposit' ? 'Deposit'
                : row.transaction_type;
    if (!merged[key]) merged[key] = { transaction_type: label, transaction_count: 0, total_amount: 0, _sides: 0 };
    if (key === 'transfer') {
      merged[key]._sides += 1;
      merged[key].transaction_count = Math.max(merged[key].transaction_count, Number(row.transaction_count) || 0);
      merged[key].total_amount += Number(row.total_amount) || 0;
    } else {
      merged[key].transaction_count += Number(row.transaction_count) || 0;
      merged[key].total_amount += Number(row.total_amount) || 0;
    }
  }
  for (const v of Object.values(merged)) {
    if (typeKey(v.transaction_type) === 'transfer' && v._sides >= 2) v.total_amount /= 2;
  }
  return Object.values(merged);
}

const DARK_OPTS = {
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 600, easing: 'easeOutQuart' },
  plugins: {
    legend: { labels: { color: '#a1a1a1', font: { size: 11 }, boxWidth: 12, padding: 16 } },
    tooltip: { backgroundColor: '#111', titleColor: '#fafafa', bodyColor: '#a1a1a1', borderColor: '#262626', borderWidth: 1, padding: 10 },
  },
  scales: {
    x: { ticks: { color: '#525252', font: { size: 11 } }, grid: { color: '#1a1a1a' }, border: { color: '#262626' } },
    y: { ticks: { color: '#525252', font: { size: 11 } }, grid: { color: '#1a1a1a' }, border: { color: '#262626' } },
  },
};

const DARK_OPTS_NO_SCALE = {
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 600, easing: 'easeOutQuart' },
  plugins: {
    legend: { labels: { color: '#a1a1a1', font: { size: 11 }, boxWidth: 12, padding: 16 } },
    tooltip: { backgroundColor: '#111', titleColor: '#fafafa', bodyColor: '#a1a1a1', borderColor: '#262626', borderWidth: 1, padding: 10 },
  },
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function exportCSV(headers, rows, filename) {
  const dq = '"';
  const escape = v => {
    const s = String(v ?? '');
    return (s.includes(',') || s.includes(dq) || s.includes('\n')) ? dq + s.split(dq).join(dq + dq) + dq : s;
  };
  const blob = new Blob([[headers, ...rows].map(r => r.map(escape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function dateLabel(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

// ─── shared components ───────────────────────────────────────────────────────

function ChartCanvas({ config, height = 260 }) {
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

function KPI({ label, value, sub, accent = 'var(--foreground)' }) {
  return html`
    <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 18px', flex:'1', minWidth:140 }}>
      <div style=${{ fontSize:11, color:'var(--muted-foreground)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.06em' }}>${label}</div>
      <div style=${{ fontSize:16, fontWeight:700, color:accent, lineHeight:1.3, wordBreak:'break-all' }}>${value}</div>
      ${sub ? html`<div style=${{ fontSize:11, color:'var(--muted-foreground)', marginTop:3 }}>${sub}</div>` : null}
    </div>
  `;
}

function ExportBtn({ onClick, label = 'Export CSV' }) {
  return html`
    <button className="btn" onClick=${onClick}
      style=${{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, padding:'6px 12px',
                background:'var(--muted)', border:'1px solid var(--border)', borderRadius:6,
                color:'var(--muted-foreground)', cursor:'pointer' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      ${label}
    </button>
  `;
}

function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return html`
    <div
      onClick=${e => { if (e.target === e.currentTarget) onClose(); }}
      style=${{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:1000,
                display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12,
                    width:'100%', maxWidth: wide ? 980 : 720, maxHeight:'82vh',
                    display:'flex', flexDirection:'column', overflow:'hidden',
                    boxShadow:'0 32px 80px rgba(0,0,0,.7)' }}>
        <div style=${{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'13px 18px', borderBottom:'1px solid var(--border)',
                      flexShrink:0, background:'rgba(255,255,255,.02)' }}>
          <span style=${{ fontSize:13, fontWeight:600, color:'var(--foreground)' }}>${title}</span>
          <button onClick=${onClose}
            style=${{ background:'none', border:'none', cursor:'pointer',
                      color:'var(--muted-foreground)', display:'flex', alignItems:'center',
                      padding:6, borderRadius:5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div style=${{ overflowY:'auto', flex:1 }}>
          ${children}
        </div>
      </div>
    </div>
  `;
}

// ─── Daily tab ────────────────────────────────────────────────────────────────

function DailyTab() {
  const today = new Date().toISOString().split('T')[0];
  const [date,        setDate]        = useState(today);
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [drillType,   setDrillType]   = useState(null);
  const [drillRows,   setDrillRows]   = useState(null);
  const [drillLoading,setDrillLoading]= useState(false);
  const [drillError,  setDrillError]  = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(''); setDrillType(null); setDrillRows(null);
    try { setData(await api.dailyReport({ report_date: date })); }
    catch (e) { setError(e.message); setData(null); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, []);

  async function openDrill(txType) {
    if (drillType === txType) { setDrillType(null); setDrillRows(null); return; }
    setDrillType(txType); setDrillRows(null); setDrillError(''); setDrillLoading(true);
    try {
      const d = await api.dailyReportDetail({ report_date: date, transaction_type: txType });
      setDrillRows(Array.isArray(d) ? d : []);
    } catch (e) { setDrillError(e.message); setDrillRows([]); }
    finally { setDrillLoading(false); }
  }

  const rows = mergeTransferRows(data?.rows || []);
  const grandCount = rows.reduce((s, r) => s + r.transaction_count, 0);
  const grandTotal = rows.reduce((s, r) => s + r.total_amount, 0);

  const doughnutConfig = rows.length ? {
    type: 'doughnut',
    data: {
      labels: rows.map(r => r.transaction_type),
      datasets: [{ data: rows.map(r => r.transaction_count),
        backgroundColor: rows.map(r => TYPE_COLORS[typeKey(r.transaction_type)]?.bg ?? 'rgba(161,161,161,.2)'),
        borderColor:     rows.map(r => TYPE_COLORS[typeKey(r.transaction_type)]?.border ?? '#a1a1a1'),
        borderWidth: 1.5, hoverOffset: 6 }],
    },
    options: { ...DARK_OPTS_NO_SCALE, cutout: '64%', plugins: { ...DARK_OPTS_NO_SCALE.plugins, legend: { position:'bottom', labels:{ color:'#a1a1a1', font:{size:11}, boxWidth:12, padding:14 } } } },
  } : null;

  const barConfig = rows.length ? {
    type: 'bar',
    data: {
      labels: rows.map(r => r.transaction_type),
      datasets: [{ label: 'Volume (VND)', data: rows.map(r => r.total_amount),
        backgroundColor: rows.map(r => TYPE_COLORS[typeKey(r.transaction_type)]?.bg ?? 'rgba(161,161,161,.2)'),
        borderColor:     rows.map(r => TYPE_COLORS[typeKey(r.transaction_type)]?.border ?? '#a1a1a1'),
        borderWidth: 1.5, borderRadius: 5 }],
    },
    options: {
      ...DARK_OPTS, indexAxis: 'y',
      plugins: { ...DARK_OPTS.plugins, legend: { display: false } },
      scales: {
        x: { ...DARK_OPTS.scales.x, ticks: { ...DARK_OPTS.scales.x.ticks, callback: v => fmt.currency(v) } },
        y: { ...DARK_OPTS.scales.y },
      },
    },
  } : null;

  const handleExport = () => {
    if (!rows.length) return;
    exportCSV(
      ['Transaction Type', 'Count', 'Total Amount (VND)', '% of Volume'],
      rows.map(r => [r.transaction_type, r.transaction_count, r.total_amount, grandTotal ? ((r.total_amount / grandTotal) * 100).toFixed(1) + '%' : '0%'])
        .concat([['TOTAL', grandCount, grandTotal, '100%']]),
      `daily-report-${date}.csv`
    );
  };

  const handleDrillExport = () => {
    if (!drillRows?.length) return;
    exportCSV(
      ['ID', 'Type', 'Account', 'Customer', 'Amount (VND)', 'Date', 'Description'],
      drillRows.map(r => [r.transaction_id, r.transaction_type, r.account_number, r.customer_name, r.amount, r.transaction_date, r.description || '']),
      `transactions-${drillType}-${date}.csv`
    );
  };

  return html`
    <div>
      <div style=${{ display:'flex', alignItems:'center', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <div style=${{ display:'flex', alignItems:'center', gap:8 }}>
          <label style=${{ fontSize:12, color:'var(--muted-foreground)', whiteSpace:'nowrap' }}>Report date:</label>
          <input type="date" className="form-input" value=${date} onChange=${e => setDate(e.target.value)} style=${{ width:170, height:32, fontSize:13 }} />
        </div>
        <button className="btn btn-primary" onClick=${load} disabled=${loading} style=${{ height:32, fontSize:13 }}>
          ${loading ? html`<${Spinner} />` : 'Load'}
        </button>
        ${rows.length > 0 ? html`<${ExportBtn} onClick=${handleExport} />` : null}
      </div>

      ${loading
        ? html`<div className="empty-state"><${Spinner} large /></div>`
        : error
          ? html`<div className="alert alert-danger">${error}</div>`
          : !data
            ? null
            : !rows.length
              ? html`<div className="empty-state"><div className="empty-state-title">No transactions</div><div className="empty-state-text">No transactions recorded for ${fmt.date(date)}.</div></div>`
              : html`
                <div style=${{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
                  <${KPI} label="Date" value=${fmt.date(data.report_date)} />
                  <${KPI} label="Total transactions" value=${fmt.num(grandCount)} />
                  <${KPI} label="Total volume" value=${fmt.currency(grandTotal)} accent="var(--chart-2)" />
                  <${KPI} label="Types" value=${rows.length} />
                </div>

                <div style=${{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:14, marginBottom:18 }}>
                  <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
                    <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Transaction mix</div>
                    <${ChartCanvas} key=${JSON.stringify(doughnutConfig?.data)} config=${doughnutConfig} height=${220} />
                  </div>
                  <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
                    <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Volume by type</div>
                    <${ChartCanvas} key=${JSON.stringify(barConfig?.data)} config=${barConfig} height=${220} />
                  </div>
                </div>

                <div className="tbl-wrap">
                  <div className="tbl-head">
                    <span className="tbl-head-title">By type</span>
                    <span style=${{ fontSize:11, color:'var(--muted-foreground)' }}>Click a row to see individual transactions</span>
                  </div>
                  <table>
                    <thead>
                      <tr><th>Type</th><th>Count</th><th>Total amount</th><th>% of volume</th><th style=${{ width:140 }}>Share</th></tr>
                    </thead>
                    <tbody>
                      ${rows.map(row => html`
                        <tr key=${row.transaction_type} className="clickable"
                          onClick=${() => openDrill(row.transaction_type)}
                          style=${{ background: drillType === row.transaction_type ? 'rgba(145,197,255,.06)' : '' }}>
                          <td style=${{ fontWeight:500 }}>
                            <span style=${{ display:'inline-block', width:8, height:8, borderRadius:'50%', background: TYPE_COLORS[typeKey(row.transaction_type)]?.border ?? '#a1a1a1', marginRight:8 }}></span>
                            ${row.transaction_type}
                          </td>
                          <td>${fmt.num(row.transaction_count)}</td>
                          <td style=${{ color: TYPE_COLORS[typeKey(row.transaction_type)]?.border ?? 'var(--foreground)', fontVariantNumeric:'tabular-nums' }}>${fmt.currency(row.total_amount)}</td>
                          <td style=${{ color:'var(--muted-foreground)' }}>${grandTotal > 0 ? ((row.total_amount / grandTotal) * 100).toFixed(1) : '0'}%</td>
                          <td>
                            <div style=${{ background:'var(--muted)', borderRadius:4, height:6, overflow:'hidden' }}>
                              <div style=${{ background: TYPE_COLORS[typeKey(row.transaction_type)]?.border ?? '#a1a1a1', width:`${grandTotal > 0 ? (row.total_amount / grandTotal) * 100 : 0}%`, height:'100%', borderRadius:4 }}></div>
                            </div>
                          </td>
                        </tr>
                      `)}
                      <tr style=${{ borderTop:'2px solid var(--border)', fontWeight:600 }}>
                        <td>Total</td><td>${fmt.num(grandCount)}</td>
                        <td style=${{ color:'var(--chart-2)' }}>${fmt.currency(grandTotal)}</td>
                        <td>100%</td><td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                ${drillType ? html`
                  <${Modal} wide
                    title=${'Transactions — ' + drillType + ' — ' + fmt.date(date)}
                    onClose=${() => { setDrillType(null); setDrillRows(null); }}>
                    ${drillLoading
                      ? html`<div className="empty-state"><${Spinner} /></div>`
                      : drillError
                        ? html`<div className="alert alert-danger" style=${{ margin:16 }}>${drillError}</div>`
                        : !drillRows?.length
                          ? html`<div className="empty-state"><div className="empty-state-text">No individual records found.</div></div>`
                          : html`
                            <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                              <span style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${drillRows.length} transaction(s)</span>
                              <${ExportBtn} onClick=${handleDrillExport} label=${'Export ' + drillRows.length + ' rows'} />
                            </div>
                            <table>
                              <thead><tr><th>ID</th><th>Account</th><th>Customer</th><th style=${{ textAlign:'right' }}>Amount</th><th>Date / Time</th><th>Description</th></tr></thead>
                              <tbody>
                                ${drillRows.map(r => html`
                                  <tr key=${r.transaction_id}>
                                    <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>#${r.transaction_id}</td>
                                    <td style=${{ fontFamily:'monospace', fontSize:12 }}>${r.account_number}</td>
                                    <td style=${{ fontSize:13 }}>${r.customer_name}</td>
                                    <td style=${{ textAlign:'right', color: TYPE_COLORS[typeKey(r.transaction_type)]?.border ?? 'var(--foreground)', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>${fmt.currency(r.amount)}</td>
                                    <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>${fmt.datetime(r.transaction_date)}</td>
                                    <td style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${r.description || '-'}</td>
                                  </tr>
                                `)}
                              </tbody>
                            </table>
                          `
                    }
                  <//>
                ` : null}
              `
      }
    </div>
  `;
}

// ─── Trend tab ────────────────────────────────────────────────────────────────

const TREND_WINDOWS = [
  { label: '7 days',  days: 7  },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

function TrendTab() {
  const [winDays, setWinDays] = useState(14);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(''); setLoading(true);

    api.dailyReportRange({ days: winDays })
      .then(results => {
        if (!cancelled) setData(Array.isArray(results) ? results : []);
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [winDays]);

  const windowPills = html`
    <div style=${{ display:'flex', gap:4 }}>
      ${TREND_WINDOWS.map(w => html`
        <button key=${w.days} onClick=${() => setWinDays(w.days)}
          style=${{
            fontSize:11, padding:'3px 10px', borderRadius:5, cursor:'pointer', border:'1px solid',
            borderColor: winDays === w.days ? '#91c5ff' : 'var(--border)',
            background:  winDays === w.days ? 'rgba(145,197,255,.15)' : 'var(--muted)',
            color:       winDays === w.days ? '#91c5ff' : 'var(--muted-foreground)',
          }}>
          ${w.label}
        </button>
      `)}
    </div>
  `;

  if (loading) return html`
    <div>
      <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, flexWrap:'wrap', gap:8 }}>
        <div style=${{ fontSize:13, color:'var(--muted-foreground)' }}>Loading ${winDays}-day trend...</div>
        ${windowPills}
      </div>
      <div className="empty-state"><${Spinner} large /></div>
    </div>
  `;
  if (error) return html`<div className="alert alert-danger">${error}</div>`;
  if (!data) return null;

  const labels      = data.map(d => dateLabel(d.report_date));
  const mergedData  = data.map(d => mergeTransferRows(d.rows || []));
  const totals      = mergedData.map(rows => rows.reduce((s, r) => s + r.total_amount, 0));
  const counts      = mergedData.map(rows => rows.reduce((s, r) => s + r.transaction_count, 0));
  const canonTypes  = [...new Set(data.flatMap(d => mergeTransferRows(d.rows || []).map(r => r.transaction_type)))];

  const typeDatasets = canonTypes.map(type => {
    const col = TYPE_COLORS[typeKey(type)];
    return {
      label: type,
      data: data.map(d => mergeTransferRows(d.rows || []).find(r => r.transaction_type === type)?.total_amount ?? 0),
      borderColor: col?.border ?? '#a1a1a1',
      backgroundColor: col?.bg ?? 'rgba(161,161,161,.1)',
      borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.35, fill: false,
    };
  });

  const lineConfig = {
    type: 'line', data: { labels, datasets: typeDatasets },
    options: {
      ...DARK_OPTS, interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ...DARK_OPTS.scales.x },
        y: { ...DARK_OPTS.scales.y, ticks: { ...DARK_OPTS.scales.y.ticks, callback: v => fmt.currency(v) } },
      },
    },
  };

  const barConfig = {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Transactions', data: counts, backgroundColor: 'rgba(145,197,255,.18)', borderColor: '#91c5ff', borderWidth: 1.5, borderRadius: 4 }] },
    options: {
      ...DARK_OPTS, plugins: { ...DARK_OPTS.plugins, legend: { display: false } },
    },
  };

  const totalVol = totals.reduce((a, b) => a + b, 0);
  const totalCnt = counts.reduce((a, b) => a + b, 0);
  const peakIdx  = totals.indexOf(Math.max(...totals));
  const peakDay  = data[peakIdx] ?? data[0];
  const avgVol   = data.length ? totalVol / data.length : 0;

  const handleExport = () => {
    exportCSV(
      ['Date', 'Transaction Count', 'Total Volume (VND)'],
      data.map((d, i) => [d.report_date, counts[i], totals[i]]),
      `trend-${winDays}days.csv`
    );
  };

  // reversed for table (newest first)
  const reversed = [...data].map((d, i) => ({ d, i })).reverse();

  return html`
    <div>
      <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, flexWrap:'wrap', gap:8 }}>
        <div style=${{ display:'flex', alignItems:'center', gap:12 }}>
          <div style=${{ fontSize:13, color:'var(--muted-foreground)' }}>${winDays}-day transaction trend</div>
          ${windowPills}
        </div>
        <${ExportBtn} onClick=${handleExport} />
      </div>

      <div style=${{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <${KPI} label=${'Volume (' + winDays + 'd)'} value=${fmt.currency(totalVol)} accent="var(--chart-2)" />
        <${KPI} label="Total transactions" value=${fmt.num(totalCnt)} />
        <${KPI} label="Daily avg" value=${fmt.currency(Math.round(avgVol))} />
        <${KPI} label="Peak day" value=${dateLabel(peakDay.report_date)} sub=${fmt.currency(totals[peakIdx])} accent="#22c55e" />
      </div>

      <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:14 }}>
        <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Volume by transaction type</div>
        <${ChartCanvas} key=${'trend-line-' + winDays} config=${lineConfig} height=${260} />
      </div>

      <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:14 }}>
        <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Daily transaction count</div>
        <${ChartCanvas} key=${'trend-bar-' + winDays} config=${barConfig} height=${200} />
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Date</th><th>Transactions</th><th>Total Volume</th></tr></thead>
          <tbody>
            ${reversed.map(({ d, i }) => html`
              <tr key=${d.report_date}>
                <td style=${{ fontWeight:500 }}>${fmt.date(d.report_date)}</td>
                <td>${fmt.num(counts[i])}</td>
                <td style=${{ color:'var(--chart-2)', fontVariantNumeric:'tabular-nums' }}>${fmt.currency(totals[i])}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Balances tab ─────────────────────────────────────────────────────────────

function BalancesTab() {
  const [data,         setData]        = useState(null);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState('');
  const [search,       setSearch]      = useState('');
  const [sortDir,      setSortDir]     = useState('desc');
  const [selectedCust, setSelectedCust]= useState(null);
  const [custAccs,     setCustAccs]    = useState(null);
  const [custLoading,  setCustLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.balancesReport()
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function openCustDetail(row) {
    if (selectedCust?.customer_id === row.customer_id) { setSelectedCust(null); setCustAccs(null); return; }
    setSelectedCust(row); setCustAccs(null); setCustLoading(true);
    try {
      const res = await api.getCustomerAccounts(row.customer_id);
      setCustAccs(res.accounts || []);
    } catch { setCustAccs([]); }
    finally { setCustLoading(false); }
  }

  if (loading) return html`<div className="empty-state"><${Spinner} large /></div>`;
  if (error)   return html`<div className="alert alert-danger">${error}</div>`;
  if (!Array.isArray(data)) return null;
  if (!data.length) return html`<div className="empty-state"><div className="empty-state-title">No data</div></div>`;

  const totalBal = data.reduce((s, r) => s + (r.total_balance ?? 0), 0);
  const maxBal   = Math.max(...data.map(r => r.total_balance ?? 0));
  const avgBal   = data.length ? totalBal / data.length : 0;
  const top15    = [...data].sort((a, b) => (b.total_balance ?? 0) - (a.total_balance ?? 0)).slice(0, 15);

  const filtered = data
    .filter(r => !search || r.customer_name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortDir === 'desc' ? (b.total_balance ?? 0) - (a.total_balance ?? 0) : (a.total_balance ?? 0) - (b.total_balance ?? 0));

  const barConfig = {
    type: 'bar',
    data: {
      labels: top15.map(r => r.customer_name?.split(' ').slice(-1)[0] ?? r.customer_name),
      datasets: [{ label: 'Balance (VND)', data: top15.map(r => r.total_balance ?? 0),
        backgroundColor: 'rgba(145,197,255,.18)', borderColor: '#91c5ff', borderWidth: 1.5, borderRadius: 5 }],
    },
    options: {
      ...DARK_OPTS, indexAxis: 'y',
      plugins: { ...DARK_OPTS.plugins, legend: { display: false } },
      scales: {
        x: { ...DARK_OPTS.scales.x, ticks: { ...DARK_OPTS.scales.x.ticks, callback: v => fmt.currency(v) } },
        y: { ...DARK_OPTS.scales.y, ticks: { ...DARK_OPTS.scales.y.ticks, font: { size: 10 } } },
      },
    },
  };

  const handleExport = () => {
    exportCSV(
      ['Rank', 'Customer', 'Customer ID', 'Total Balance (VND)', '% of Total'],
      filtered.map((r, i) => [i + 1, r.customer_name, r.customer_id, r.total_balance ?? 0, totalBal ? ((r.total_balance / totalBal) * 100).toFixed(2) + '%' : '0%']),
      'customer-balances.csv'
    );
  };

  return html`
    <div>
      <div style=${{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <${KPI} label="Customers" value=${fmt.num(data.length)} />
        <${KPI} label="Total balance" value=${fmt.currency(totalBal)} accent="var(--chart-2)" />
        <${KPI} label="Average balance" value=${fmt.currency(Math.round(avgBal))} />
        <${KPI} label="Top balance" value=${fmt.currency(maxBal)} accent="#22c55e" sub=${top15[0]?.customer_name} />
      </div>

      <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:14 }}>
        <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Top 15 by balance</div>
        <${ChartCanvas} key="balances-bar" config=${barConfig} height=${Math.max(220, top15.length * 24)} />
      </div>

      <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, gap:10, flexWrap:'wrap' }}>
        <div style=${{ display:'flex', gap:8, alignItems:'center' }}>
          <input className="form-input" placeholder="Search customer..." value=${search}
            onChange=${e => setSearch(e.target.value)} style=${{ width:220, height:32, fontSize:13 }} />
          <button className="btn" onClick=${() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            style=${{ height:32, fontSize:12, padding:'0 12px', background:'var(--muted)', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted-foreground)', cursor:'pointer' }}>
            ${sortDir === 'desc' ? '↓ Highest first' : '↑ Lowest first'}
          </button>
        </div>
        <${ExportBtn} onClick=${handleExport} />
      </div>

      <div className="tbl-wrap">
        <div className="tbl-head">
          <span className="tbl-head-title">${filtered.length} customer(s)</span>
          <span style=${{ fontSize:11, color:'var(--muted-foreground)' }}>Click a row to see accounts</span>
        </div>
        <table>
          <thead><tr><th>#</th><th>Customer</th><th>Total Balance</th><th>% of Total</th><th style=${{ width:140 }}>Share</th></tr></thead>
          <tbody>
            ${filtered.map((r, i) => html`
              <tr key=${r.customer_id} className="clickable"
                onClick=${() => openCustDetail(r)}
                style=${{ background: selectedCust?.customer_id === r.customer_id ? 'rgba(145,197,255,.06)' : '' }}>
                <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>${i + 1}</td>
                <td style=${{ fontWeight:500 }}>${r.customer_name}</td>
                <td style=${{ color:'#91c5ff', fontVariantNumeric:'tabular-nums' }}>${fmt.currency(r.total_balance)}</td>
                <td style=${{ color:'var(--muted-foreground)' }}>${totalBal > 0 ? ((r.total_balance / totalBal) * 100).toFixed(2) : '0'}%</td>
                <td>
                  <div style=${{ background:'var(--muted)', borderRadius:4, height:6, overflow:'hidden' }}>
                    <div style=${{ background:'#91c5ff', width:`${maxBal > 0 ? ((r.total_balance ?? 0) / maxBal) * 100 : 0}%`, height:'100%', borderRadius:4 }}></div>
                  </div>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>

      ${selectedCust ? html`
        <${Modal}
          title=${'Accounts — ' + selectedCust.customer_name}
          onClose=${() => { setSelectedCust(null); setCustAccs(null); }}>
          ${custLoading
            ? html`<div className="empty-state"><${Spinner} /></div>`
            : !custAccs?.length
              ? html`<div className="empty-state"><div className="empty-state-text">No accounts found.</div></div>`
              : html`
                <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                  <span style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${custAccs.length} account(s)</span>
                  <${Link} to=${'/customers/' + selectedCust.customer_id} style=${{ fontSize:12, color:'var(--chart-2)' }}>Customer profile →<//>
                </div>
                <table>
                  <thead><tr><th>Account #</th><th>Type</th><th>Branch</th><th style=${{ textAlign:'right' }}>Balance</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    ${custAccs.map(a => html`
                      <tr key=${a.account_id}>
                        <td style=${{ fontFamily:'monospace', fontSize:12 }}>${a.account_number}</td>
                        <td style=${{ fontSize:12 }}>${a.account_type}</td>
                        <td style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${a.branch_name}</td>
                        <td style=${{ textAlign:'right', color:'var(--chart-2)', fontWeight:500, fontVariantNumeric:'tabular-nums' }}>${fmt.currency(a.balance)}</td>
                        <td><span className=${'badge ' + (a.status?.toLowerCase() === 'active' ? 'badge-green' : 'badge-gray')}>${a.status}</span></td>
                        <td><${Link} to=${'/accounts/' + a.account_id} className="btn btn-ghost btn-sm">View<//>  </td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              `
          }
        <//>
      ` : null}

      ${filtered.length === 0 && search ? html`
        <div className="empty-state"><div className="empty-state-text">No customers match "${search}".</div></div>
      ` : null}
    </div>
  `;
}

// ─── Branch tab ───────────────────────────────────────────────────────────────

function BranchTab() {
  const [data,           setData]          = useState(null);
  const [txStats,        setTxStats]       = useState(null);
  const [loading,        setLoading]       = useState(false);
  const [error,          setError]         = useState('');
  const [selectedBranch, setSelectedBranch]= useState(null);
  const [allEmps,        setAllEmps]       = useState(null);
  const [empsLoading,    setEmpsLoading]   = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.branchReport(), api.branchTransactionStats()])
      .then(([branchData, statsData]) => {
        setData(branchData);
        setTxStats(Array.isArray(statsData) ? statsData : []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function openBranchDetail(row) {
    if (selectedBranch?.branch_id === row.branch_id) { setSelectedBranch(null); return; }
    setSelectedBranch(row);
    if (allEmps === null) {
      setEmpsLoading(true);
      try {
        const d = await api.listEmployees();
        setAllEmps(d.employees || []);
      } catch { setAllEmps([]); }
      finally { setEmpsLoading(false); }
    }
  }

  if (loading) return html`<div className="empty-state"><${Spinner} large /></div>`;
  if (error)   return html`<div className="alert alert-danger">${error}</div>`;
  if (!Array.isArray(data)) return null;
  if (!data.length) return html`<div className="empty-state"><div className="empty-state-title">No data</div></div>`;

  const statsMap = {};
  (txStats || []).forEach(s => { statsMap[s.branch_id] = s; });

  const EMPTY_STATS = { tx_count:0, deposit_volume:0, withdrawal_volume:0, transfer_volume:0, deposit_count:0, withdrawal_count:0, suspicious_count:0, suspicious_amount:0, unreviewed_count:0, loan_count:0 };
  const merged = data.map(r => ({ ...r, ...(statsMap[r.branch_id] || EMPTY_STATS) }));

  const totalDeposits  = data.reduce((s, r) => s + (r.total_deposits ?? 0), 0);
  const totalAccounts  = data.reduce((s, r) => s + (r.account_count  ?? 0), 0);
  const totalEmployees = data.reduce((s, r) => s + (r.employee_count ?? 0), 0);
  const totalTx        = merged.reduce((s, r) => s + (r.tx_count ?? 0), 0);
  const totalAlerts    = merged.reduce((s, r) => s + (r.suspicious_count ?? 0), 0);
  const topBranch      = [...data].sort((a, b) => (b.total_deposits ?? 0) - (a.total_deposits ?? 0))[0];

  const labels = merged.map(r => r.branch_name);

  const accountsConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Accounts', data: merged.map(r => r.account_count ?? 0),
        backgroundColor: 'rgba(145,197,255,.22)', borderColor: '#91c5ff', borderWidth: 1.5, borderRadius: 4 }],
    },
    options: { ...DARK_OPTS, plugins: { ...DARK_OPTS.plugins, legend: { display: false } } },
  };

  const txVolumeConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Deposits',    data: merged.map(r => r.deposit_volume    ?? 0), backgroundColor: 'rgba(34,197,94,.22)',  borderColor: '#22c55e', borderWidth: 1.5 },
        { label: 'Withdrawals', data: merged.map(r => r.withdrawal_volume ?? 0), backgroundColor: 'rgba(239,68,68,.18)', borderColor: '#ef4444', borderWidth: 1.5 },
        { label: 'Transfers',   data: merged.map(r => r.transfer_volume   ?? 0), backgroundColor: 'rgba(145,197,255,.18)',borderColor: '#91c5ff', borderWidth: 1.5 },
      ],
    },
    options: {
      ...DARK_OPTS,
      scales: {
        x: { ...DARK_OPTS.scales.x, stacked: true },
        y: { ...DARK_OPTS.scales.y, stacked: true, ticks: { ...DARK_OPTS.scales.y.ticks, callback: v => fmt.currency(v) } },
      },
    },
  };

  const loansConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Loan accounts', data: merged.map(r => r.loan_count ?? 0),
        backgroundColor: 'rgba(245,158,11,.22)', borderColor: '#f59e0b', borderWidth: 1.5, borderRadius: 4 }],
    },
    options: { ...DARK_OPTS, plugins: { ...DARK_OPTS.plugins, legend: { display: false } } },
  };

  const suspConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Total alerts', data: merged.map(r => r.suspicious_count  ?? 0), backgroundColor: 'rgba(239,68,68,.2)',   borderColor: '#ef4444', borderWidth: 1.5, borderRadius: 3 },
        { label: 'Unreviewed',   data: merged.map(r => r.unreviewed_count   ?? 0), backgroundColor: 'rgba(245,158,11,.25)', borderColor: '#f59e0b', borderWidth: 1.5, borderRadius: 3 },
      ],
    },
    options: { ...DARK_OPTS },
  };

  const handleExport = () => {
    exportCSV(
      ['Branch', 'City', 'Accounts', 'Employees', 'Total Deposits (VND)', 'Transactions', 'Loan Accounts', 'Suspicious Alerts'],
      merged.map(r => [r.branch_name, r.city || '', r.account_count ?? 0, r.employee_count ?? 0,
        r.total_deposits ?? 0, r.tx_count ?? 0, r.loan_count ?? 0, r.suspicious_count ?? 0]),
      'branch-activity.csv'
    );
  };

  const branchEmps = selectedBranch && allEmps !== null
    ? allEmps.filter(e => e.branch_id === selectedBranch.branch_id)
    : null;
  const selStats = selectedBranch ? (statsMap[selectedBranch.branch_id] || null) : null;

  return html`
    <div>
      <div style=${{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <${KPI} label="Branches"       value=${fmt.num(data.length)} />
        <${KPI} label="Total deposits" value=${fmt.currency(totalDeposits)} accent="#22c55e" />
        <${KPI} label="Total accounts" value=${fmt.num(totalAccounts)} />
        <${KPI} label="Transactions"   value=${fmt.num(totalTx)} />
        <${KPI} label="Top branch"     value=${topBranch?.branch_name} sub=${fmt.currency(topBranch?.total_deposits)} accent="var(--chart-2)" />
      </div>

      <div style=${{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:14, marginBottom:14 }}>
        <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
          <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Accounts by branch</div>
          <${ChartCanvas} key="branch-accounts" config=${accountsConfig} height=${220} />
        </div>
        <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
          <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Transaction volume by branch</div>
          <${ChartCanvas} key="branch-txvol" config=${txVolumeConfig} height=${220} />
        </div>
        <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
          <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Loan accounts by branch</div>
          <${ChartCanvas} key="branch-loans" config=${loansConfig} height=${220} />
        </div>
        <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
          <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Suspicious activity by branch</div>
          <${ChartCanvas} key="branch-susp" config=${suspConfig} height=${220} />
        </div>
      </div>

      <div style=${{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
        <${ExportBtn} onClick=${handleExport} />
      </div>

      <div className="tbl-wrap">
        <div className="tbl-head">
          <span className="tbl-head-title">Branch details</span>
          <span style=${{ fontSize:11, color:'var(--muted-foreground)' }}>Click a row for full details</span>
        </div>
        <table>
          <thead>
            <tr><th>Branch</th><th>City</th><th>Accounts</th><th>Employees</th><th>Total Deposits</th><th>Transactions</th><th>Alerts</th></tr>
          </thead>
          <tbody>
            ${merged.map(r => html`
              <tr key=${r.branch_id} className="clickable"
                onClick=${() => openBranchDetail(r)}
                style=${{ background: selectedBranch?.branch_id === r.branch_id ? 'rgba(34,197,94,.05)' : '' }}>
                <td style=${{ fontWeight:600 }}>${r.branch_name}</td>
                <td style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${r.city || '-'}</td>
                <td>${fmt.num(r.account_count)}</td>
                <td>${fmt.num(r.employee_count)}</td>
                <td>
                  <div style=${{ color:'#22c55e', fontWeight:500, fontVariantNumeric:'tabular-nums' }}>${fmt.currency(r.total_deposits)}</div>
                  <div style=${{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                    <div style=${{ flex:1, background:'var(--muted)', borderRadius:3, height:4, overflow:'hidden' }}>
                      <div style=${{ background:'#22c55e', width:`${totalDeposits > 0 ? ((r.total_deposits ?? 0) / totalDeposits) * 100 : 0}%`, height:'100%', borderRadius:3 }}></div>
                    </div>
                    <span style=${{ fontSize:10, color:'var(--muted-foreground)', minWidth:30 }}>${totalDeposits > 0 ? (((r.total_deposits ?? 0) / totalDeposits) * 100).toFixed(1) : '0'}%</span>
                  </div>
                </td>
                <td style=${{ color:'var(--muted-foreground)', fontVariantNumeric:'tabular-nums' }}>${fmt.num(r.tx_count)}</td>
                <td>
                  ${(r.suspicious_count ?? 0) > 0
                    ? html`<span style=${{ color:(r.unreviewed_count ?? 0) > 0 ? '#ef4444' : '#22c55e', fontWeight:500 }}>${fmt.num(r.suspicious_count)}</span>`
                    : html`<span style=${{ color:'var(--muted-foreground)' }}>—</span>`
                  }
                </td>
              </tr>
            `)}
            <tr style=${{ borderTop:'2px solid var(--border)', fontWeight:600 }}>
              <td>Total</td><td></td>
              <td>${fmt.num(totalAccounts)}</td>
              <td>${fmt.num(totalEmployees)}</td>
              <td style=${{ color:'#22c55e' }}>${fmt.currency(totalDeposits)}</td>
              <td>${fmt.num(totalTx)}</td>
              <td>${totalAlerts > 0 ? fmt.num(totalAlerts) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${selectedBranch ? html`
        <${Modal} wide
          title=${'Branch — ' + selectedBranch.branch_name + (selectedBranch.city ? ' (' + selectedBranch.city + ')' : '')}
          onClose=${() => setSelectedBranch(null)}>

          <div style=${{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, flexWrap:'wrap' }}>
            <${KPI} label="Accounts"       value=${fmt.num(selectedBranch.account_count)} />
            <${KPI} label="Employees"      value=${fmt.num(selectedBranch.employee_count)} />
            <${KPI} label="Total deposits" value=${fmt.currency(selectedBranch.total_deposits)} accent="#22c55e" />
            ${selStats ? html`
              <${KPI} label="Transactions" value=${fmt.num(selStats.tx_count)} />
              <${KPI} label="Loan accounts" value=${fmt.num(selStats.loan_count)} accent="#f59e0b" />
              <${KPI} label="Alerts" value=${fmt.num(selStats.suspicious_count)}
                accent=${selStats.unreviewed_count > 0 ? '#ef4444' : 'var(--foreground)'}
                sub=${selStats.suspicious_count > 0 ? (selStats.unreviewed_count > 0 ? selStats.unreviewed_count + ' unreviewed' : 'all reviewed') : null} />
            ` : null}
          </div>

          ${selStats ? html`
            <div style=${{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
              <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:10, textTransform:'uppercase', letterSpacing:'.06em' }}>Transaction breakdown</div>
              <table>
                <thead><tr><th>Type</th><th>Count</th><th style=${{ textAlign:'right' }}>Volume</th></tr></thead>
                <tbody>
                  <tr>
                    <td><span style=${{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#22c55e', marginRight:8 }}></span>Deposits</td>
                    <td>${fmt.num(selStats.deposit_count)}</td>
                    <td style=${{ textAlign:'right', color:'#22c55e', fontVariantNumeric:'tabular-nums' }}>${fmt.currency(selStats.deposit_volume)}</td>
                  </tr>
                  <tr>
                    <td><span style=${{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#ef4444', marginRight:8 }}></span>Withdrawals</td>
                    <td>${fmt.num(selStats.withdrawal_count)}</td>
                    <td style=${{ textAlign:'right', color:'#ef4444', fontVariantNumeric:'tabular-nums' }}>${fmt.currency(selStats.withdrawal_volume)}</td>
                  </tr>
                  <tr>
                    <td><span style=${{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#91c5ff', marginRight:8 }}></span>Transfers</td>
                    <td style=${{ color:'var(--muted-foreground)' }}>—</td>
                    <td style=${{ textAlign:'right', color:'#91c5ff', fontVariantNumeric:'tabular-nums' }}>${fmt.currency(selStats.transfer_volume)}</td>
                  </tr>
                  <tr style=${{ borderTop:'1px solid var(--border)', fontWeight:600 }}>
                    <td>Total</td>
                    <td>${fmt.num(selStats.tx_count)}</td>
                    <td style=${{ textAlign:'right', color:'var(--chart-2)', fontVariantNumeric:'tabular-nums' }}>${fmt.currency((selStats.deposit_volume ?? 0) + (selStats.withdrawal_volume ?? 0) + (selStats.transfer_volume ?? 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ` : null}

          ${selStats && (selStats.suspicious_count ?? 0) > 0 ? html`
            <div style=${{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
              <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'.06em' }}>Suspicious activity</div>
              <span style=${{ color:'#ef4444', fontWeight:600 }}>${fmt.num(selStats.suspicious_count)} alert(s)</span>
              ${(selStats.unreviewed_count ?? 0) > 0
                ? html`<span style=${{ color:'#f59e0b', fontSize:12 }}>${fmt.num(selStats.unreviewed_count)} unreviewed</span>`
                : html`<span style=${{ color:'#22c55e', fontSize:12 }}>All reviewed</span>`}
              <span style=${{ color:'var(--muted-foreground)', fontSize:12 }}>Total amount: ${fmt.currency(selStats.suspicious_amount)}</span>
            </div>
          ` : null}

          <div style=${{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <span style=${{ fontSize:12, fontWeight:600, color:'var(--foreground)' }}>Employees</span>
            ${!empsLoading && branchEmps?.length ? html`
              <span style=${{ fontSize:12, color:'var(--muted-foreground)' }}>
                ${branchEmps.length} employee(s) · avg salary:
                <span style=${{ color:'#22c55e', fontWeight:600 }}>
                  ${fmt.currency(Math.round(branchEmps.filter(e => e.salary).reduce((s, e) => s + e.salary, 0) / (branchEmps.filter(e => e.salary).length || 1)))}
                </span>
              </span>
            ` : null}
          </div>

          ${empsLoading || !branchEmps
            ? html`<div className="empty-state"><${Spinner} /></div>`
            : !branchEmps.length
              ? html`<div className="empty-state"><div className="empty-state-text">No employees assigned to this branch.</div></div>`
              : html`
                <table>
                  <thead><tr><th>Name</th><th>Position</th><th>Email</th><th>Phone</th><th style=${{ textAlign:'right' }}>Salary</th><th>Hire date</th></tr></thead>
                  <tbody>
                    ${branchEmps.map(e => html`
                      <tr key=${e.employee_id}>
                        <td style=${{ fontWeight:500 }}>${e.first_name} ${e.last_name}</td>
                        <td style=${{ fontSize:12 }}>${e.position || '-'}</td>
                        <td style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${e.email || '-'}</td>
                        <td style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${e.phone || '-'}</td>
                        <td style=${{ textAlign:'right', color:'#22c55e', fontSize:12 }}>${e.salary != null ? fmt.currency(e.salary) : '-'}</td>
                        <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>${e.hire_date ? fmt.date(e.hire_date) : '-'}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              `
          }
        <//>
      ` : null}
    </div>
  `;
}

// ─── Employees tab ────────────────────────────────────────────────────────────

function EmployeesTab() {
  const [employees, setEmployees] = useState(null);
  const [branches,  setBranches]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [sortKey,   setSortKey]   = useState('salary');

  useEffect(() => {
    setLoading(true);
    Promise.all([api.listEmployees(), api.listBranches()])
      .then(([empRes, brRes]) => {
        setEmployees(empRes.employees || []);
        setBranches(Array.isArray(brRes) ? brRes : brRes.branches || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return html`<div className="empty-state"><${Spinner} large /></div>`;
  if (error)   return html`<div className="alert alert-danger">${error}</div>`;
  if (!employees) return null;

  const branchMap = {};
  (branches || []).forEach(b => { branchMap[b.branch_id] = b.branch_name; });

  const byBranch = {};
  for (const e of employees) {
    const bn = branchMap[e.branch_id] || e.branch_name || 'Unknown';
    if (!byBranch[bn]) byBranch[bn] = { count: 0, salarySum: 0, salaryCount: 0 };
    byBranch[bn].count++;
    if (e.salary) { byBranch[bn].salarySum += e.salary; byBranch[bn].salaryCount++; }
  }

  const byPosition = {};
  for (const e of employees) {
    const p = e.position || 'Unknown';
    byPosition[p] = (byPosition[p] || 0) + 1;
  }

  const withSalary  = employees.filter(e => e.salary);
  const totalSalary = withSalary.reduce((s, e) => s + e.salary, 0);
  const avgSalary   = withSalary.length ? totalSalary / withSalary.length : 0;
  const maxSalary   = withSalary.length ? Math.max(...withSalary.map(e => e.salary)) : 0;

  const branchKeys   = Object.keys(byBranch).sort((a, b) => byBranch[b].count - byBranch[a].count);
  const positionKeys = Object.keys(byPosition).sort((a, b) => byPosition[b] - byPosition[a]).slice(0, 10);

  const branchBarConfig = {
    type: 'bar',
    data: {
      labels: branchKeys,
      datasets: [{ label: 'Employees', data: branchKeys.map(k => byBranch[k].count),
        backgroundColor: 'rgba(145,197,255,.18)', borderColor: '#91c5ff', borderWidth: 1.5, borderRadius: 4 }],
    },
    options: { ...DARK_OPTS, plugins: { ...DARK_OPTS.plugins, legend: { display: false } } },
  };

  const positionConfig = {
    type: 'bar',
    data: {
      labels: positionKeys,
      datasets: [{ label: 'Count', data: positionKeys.map(k => byPosition[k]),
        backgroundColor: 'rgba(245,158,11,.18)', borderColor: '#f59e0b', borderWidth: 1.5, borderRadius: 4 }],
    },
    options: {
      ...DARK_OPTS, indexAxis: 'y',
      plugins: { ...DARK_OPTS.plugins, legend: { display: false } },
    },
  };

  const salaryConfig = branchKeys.length ? {
    type: 'bar',
    data: {
      labels: branchKeys.filter(k => byBranch[k].salaryCount > 0),
      datasets: [{ label: 'Avg Salary (VND)',
        data: branchKeys.filter(k => byBranch[k].salaryCount > 0)
               .map(k => Math.round(byBranch[k].salarySum / byBranch[k].salaryCount)),
        backgroundColor: 'rgba(34,197,94,.18)', borderColor: '#22c55e', borderWidth: 1.5, borderRadius: 4 }],
    },
    options: {
      ...DARK_OPTS,
      plugins: { ...DARK_OPTS.plugins, legend: { display: false } },
      scales: {
        x: { ...DARK_OPTS.scales.x, ticks: { ...DARK_OPTS.scales.x.ticks, callback: v => fmt.currency(v) } },
        y: { ...DARK_OPTS.scales.y },
      },
    },
  } : null;

  const filtered = employees
    .filter(e => {
      if (!search) return true;
      const bn = branchMap[e.branch_id] || e.branch_name || '';
      return `${e.first_name} ${e.last_name} ${e.position || ''} ${bn}`.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      if (sortKey === 'salary') return (b.salary || 0) - (a.salary || 0);
      if (sortKey === 'name') return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      return 0;
    });

  const handleExport = () => {
    exportCSV(
      ['ID', 'First Name', 'Last Name', 'Position', 'Branch', 'Email', 'Phone', 'Salary (VND)', 'Hire Date'],
      filtered.map(e => [e.employee_id, e.first_name, e.last_name, e.position || '', branchMap[e.branch_id] || e.branch_name || '', e.email || '', e.phone || '', e.salary ?? '', e.hire_date || '']),
      'employees.csv'
    );
  };

  return html`
    <div>
      <div style=${{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <${KPI} label="Total employees" value=${fmt.num(employees.length)} />
        <${KPI} label="Branches" value=${fmt.num(Object.keys(byBranch).length)} />
        <${KPI} label="Positions" value=${fmt.num(Object.keys(byPosition).length)} />
        <${KPI} label="Avg salary" value=${withSalary.length ? fmt.currency(Math.round(avgSalary)) : '—'} accent="#22c55e" />
        <${KPI} label="Top salary" value=${maxSalary ? fmt.currency(maxSalary) : '—'} accent="#f59e0b" />
      </div>

      <div style=${{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:14, marginBottom:14 }}>
        <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
          <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Employees by branch</div>
          <${ChartCanvas} key="emp-branch" config=${branchBarConfig} height=${220} />
        </div>
        <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
          <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Employees by position</div>
          <${ChartCanvas} key="emp-position" config=${positionConfig} height=${220} />
        </div>
      </div>

      ${salaryConfig ? html`
        <div style=${{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:14 }}>
          <div style=${{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.06em' }}>Average salary by branch</div>
          <${ChartCanvas} key="emp-salary" config=${salaryConfig} height=${200} />
        </div>
      ` : null}

      <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, gap:10, flexWrap:'wrap' }}>
        <div style=${{ display:'flex', gap:8, alignItems:'center' }}>
          <input className="form-input" placeholder="Search name, position, branch..." value=${search}
            onChange=${e => setSearch(e.target.value)} style=${{ width:260, height:32, fontSize:13 }} />
          <select className="form-select" style=${{ height:32, fontSize:12, width:140 }} value=${sortKey}
            onChange=${e => setSortKey(e.target.value)}>
            <option value="salary">Sort: Salary ↓</option>
            <option value="name">Sort: Name A–Z</option>
          </select>
        </div>
        <${ExportBtn} onClick=${handleExport} />
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Position</th><th>Branch</th><th>Email</th><th style=${{ textAlign:'right' }}>Salary</th><th>Hire date</th></tr>
          </thead>
          <tbody>
            ${!filtered.length
              ? html`<tr><td colSpan="7"><div className="empty-state"><div className="empty-state-text">${search ? `No results for "${search}"` : 'No employees found.'}</div></div></td></tr>`
              : filtered.map(e => html`
                <tr key=${e.employee_id}>
                  <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>#${e.employee_id}</td>
                  <td style=${{ fontWeight:500 }}>${e.first_name} ${e.last_name}</td>
                  <td style=${{ fontSize:12 }}>${e.position || '-'}</td>
                  <td style=${{ fontSize:12, color:'var(--muted-foreground)' }}>${branchMap[e.branch_id] || e.branch_name || '-'}</td>
                  <td style=${{ fontSize:12 }}>${e.email || '-'}</td>
                  <td style=${{ textAlign:'right', color:'#22c55e', fontSize:12, fontVariantNumeric:'tabular-nums' }}>${e.salary != null ? fmt.currency(e.salary) : '-'}</td>
                  <td style=${{ fontSize:11, color:'var(--muted-foreground)' }}>${e.hire_date ? fmt.date(e.hire_date) : '-'}</td>
                </tr>
              `)
            }
          </tbody>
        </table>
        <div className="tbl-foot"><span>${filtered.length} employee(s)</span></div>
      </div>
    </div>
  `;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const TABS = [
  ['daily',     'Daily Report'],
  ['trend',     'N-Day Trend'],
  ['balances',  'Customer Balances'],
  ['branch',    'Branch Activity'],
  ['employees', 'Employees'],
];

export default function Reports() {
  const [tab, setTab] = useState('daily');

  return html`
    <>
      <header className="topbar"><span className="topbar-title">Reports</span></header>
      <div className="page">
        <div className="tabs" style=${{ marginBottom:20 }}>
          ${TABS.map(([key, label]) => html`
            <div key=${key} className=${'tab' + (tab === key ? ' active' : '')} onClick=${() => setTab(key)}>${label}</div>
          `)}
        </div>

        ${tab === 'daily'     ? html`<${DailyTab} />`
        : tab === 'trend'     ? html`<${TrendTab} />`
        : tab === 'balances'  ? html`<${BalancesTab} />`
        : tab === 'branch'    ? html`<${BranchTab} />`
        : tab === 'employees' ? html`<${EmployeesTab} />`
        : null}
      </div>
    </>
  `;
}
