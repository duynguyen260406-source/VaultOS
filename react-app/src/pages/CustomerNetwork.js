import { html } from '../lib/html.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import { Spinner } from '../components/Spinner.js';

function useForceGraph(nodes, edges, width, height) {
  const [positions, setPositions] = useState({});

  useEffect(() => {
    if (!nodes.length) { setPositions({}); return; }

    const pos = {};
    const cx = width / 2, cy = height / 2;
    nodes.forEach((n, i) => {
      if (n.is_root) {
        pos[n.id] = { x: cx, y: cy, vx: 0, vy: 0 };
      } else {
        const angle = (i / nodes.length) * 2 * Math.PI;
        pos[n.id] = { x: cx + Math.cos(angle) * 180, y: cy + Math.sin(angle) * 180, vx: 0, vy: 0 };
      }
    });

    const MAX_ITER = 120;
    const K = 120, REPULSION = 8000, DAMPING = 0.8;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      for (const a of nodes) {
        for (const b of nodes) {
          if (a.id === b.id) continue;
          const dx = pos[b.id].x - pos[a.id].x;
          const dy = pos[b.id].y - pos[a.id].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const f = REPULSION / (dist * dist);
          pos[a.id].vx -= (dx / dist) * f;
          pos[a.id].vy -= (dy / dist) * f;
        }
      }
      for (const e of edges) {
        if (!pos[e.from] || !pos[e.to]) continue;
        const dx = pos[e.to].x - pos[e.from].x;
        const dy = pos[e.to].y - pos[e.from].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = (dist - K) / dist * 0.05;
        pos[e.from].vx += dx * f;
        pos[e.from].vy += dy * f;
        pos[e.to].vx -= dx * f;
        pos[e.to].vy -= dy * f;
      }
      for (const n of nodes) {
        if (n.is_root) continue;
        pos[n.id].vx *= DAMPING;
        pos[n.id].vy *= DAMPING;
        pos[n.id].x = Math.max(40, Math.min(width - 40, pos[n.id].x + pos[n.id].vx));
        pos[n.id].y = Math.max(40, Math.min(height - 40, pos[n.id].y + pos[n.id].vy));
      }
    }

    const snap = {};
    for (const k in pos) snap[k] = { x: pos[k].x, y: pos[k].y };
    setPositions(snap);
  }, [nodes, edges, width, height]);

  return positions;
}

function GraphCanvas({ nodes, edges, width, height }) {
  const positions = useForceGraph(nodes, edges, width, height);
  const [hovered, setHovered] = useState(null);

  if (!nodes.length) return null;

  const maxEdgeAmount = Math.max(...edges.map(e => e.amount), 1);

  return html`
    <svg width=${width} height=${height} style="display:block;background:var(--bg-sub);border-radius:10px;overflow:visible;">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#3b82f6" opacity="0.6" />
        </marker>
      </defs>

      ${edges.map((e, i) => {
        const from = positions[e.from];
        const to = positions[e.to];
        if (!from || !to) return null;
        const thickness = 1 + (e.amount / maxEdgeAmount) * 4;
        return html`
          <g key=${i}>
            <line
              x1=${from.x} y1=${from.y} x2=${to.x} y2=${to.y}
              stroke="#3b82f6" strokeWidth=${thickness} opacity="0.35"
              markerEnd="url(#arrow)"
            />
          </g>
        `;
      })}

      ${nodes.map(n => {
        const pos = positions[n.id];
        if (!pos) return null;
        const isRoot = n.is_root;
        const isHovered = hovered === n.id;
        return html`
          <g key=${n.id}
            style="cursor:pointer;"
            onMouseEnter=${() => setHovered(n.id)}
            onMouseLeave=${() => setHovered(null)}>
            <circle
              cx=${pos.x} cy=${pos.y}
              r=${isRoot ? 22 : isHovered ? 16 : 13}
              fill=${isRoot ? '#7adf2e' : '#3b82f6'}
              opacity=${isRoot ? 0.9 : 0.7}
            />
            <text
              x=${pos.x} y=${pos.y + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize=${isRoot ? 9 : 8}
              fontFamily="monospace"
              fill="white"
              fontWeight="600"
            >#${n.id}</text>
            ${(isRoot || isHovered) && html`
              <text
                x=${pos.x} y=${pos.y + (isRoot ? 30 : 24)}
                textAnchor="middle"
                fontSize="10"
                fill="var(--foreground)"
                style="pointer-events:none;"
              >${n.label?.split(' ').slice(0, 2).join(' ')}</text>
            `}
          </g>
        `;
      })}
    </svg>
  `;
}

export default function CustomerNetwork() {
  const toast = useToast();
  const [customerId, setCustomerId] = useState('');
  const [depth, setDepth] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const cid = parseInt(customerId);
    if (!cid) { toast.error('Enter a customer ID'); return; }
    setLoading(true); setGraph(null);
    try {
      const params = { customer_id: cid, depth };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await api.customerNetwork(params);
      setGraph(res);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  return html`
    <>
      <header className="topbar">
        <span className="topbar-title">Customer Network</span>
        <div className="topbar-right" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input className="form-input" type="number" placeholder="Customer ID" style="width:130px;font-size:12px;height:30px;padding:0 8px;"
            value=${customerId} onChange=${e => setCustomerId(e.target.value)} />
          <select className="form-input" style="width:90px;font-size:12px;height:30px;padding:0 8px;"
            value=${depth} onChange=${e => setDepth(Number(e.target.value))}>
            <option value="1">Depth 1</option>
            <option value="2">Depth 2</option>
          </select>
          <input type="date" className="form-input" style="font-size:12px;height:30px;padding:0 8px;width:140px;"
            value=${dateFrom} onChange=${e => setDateFrom(e.target.value)} placeholder="From" />
          <input type="date" className="form-input" style="font-size:12px;height:30px;padding:0 8px;width:140px;"
            value=${dateTo} onChange=${e => setDateTo(e.target.value)} placeholder="To" />
          <button className="btn btn-primary btn-sm" onClick=${load} disabled=${loading || !customerId}>
            ${loading ? html`<${Spinner} />` : 'Load Graph'}
          </button>
        </div>
      </header>

      <div className="page">
        ${loading ? html`<div style="padding:80px;text-align:center;"><${Spinner} large /></div>` : graph ? html`
          <div style="display:grid;grid-template-columns:1fr 280px;gap:16px;align-items:start;">
            <div>
              <${GraphCanvas} nodes=${graph.nodes} edges=${graph.edges} width=${720} height=${480} />
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div className="card" style="padding:12px;">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--muted-foreground);margin-bottom:8px;">Graph stats</div>
                <div style="font-size:13px;">Nodes: <strong>${graph.nodes.length}</strong></div>
                <div style="font-size:13px;margin-top:4px;">Edges: <strong>${graph.edges.length}</strong></div>
              </div>

              <div className="tbl-wrap">
                <div className="tbl-head"><span className="tbl-head-title" style="font-size:11px;">Top connections</span></div>
                <table>
                  <thead><tr><th style="font-size:10px;">From</th><th style="font-size:10px;">To</th><th style="font-size:10px;">Amount</th></tr></thead>
                  <tbody>
                    ${graph.edges.slice(0,10).map((e, i) => html`
                      <tr key=${i}>
                        <td style="font-size:11px;font-family:monospace;">#${e.from}</td>
                        <td style="font-size:11px;font-family:monospace;">#${e.to}</td>
                        <td style="font-size:11px;color:var(--blue-90);">${fmt.currency(e.amount)}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ` : html`
          <div className="empty-state">
            <div className="empty-icon-wrap">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/>
                <line x1="7" y1="11" x2="17" y2="6"/><line x1="7" y1="13" x2="17" y2="18"/>
              </svg>
            </div>
            <div className="empty-state-title">Enter a customer ID</div>
            <div className="empty-state-text">Load the transfer network graph for a customer to see their connections.</div>
          </div>
        `}
      </div>
    </>
  `;
}
