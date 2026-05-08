import { html } from '../lib/html.js';
import { useState, useEffect, useRef } from 'react';
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
        pos[n.id] = { x: cx + Math.cos(angle) * 190, y: cy + Math.sin(angle) * 190, vx: 0, vy: 0 };
      }
    });

    const K = 130, REPULSION = 9000, DAMPING = 0.78;
    for (let iter = 0; iter < 150; iter++) {
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
        pos[e.from].vx += dx * f; pos[e.from].vy += dy * f;
        pos[e.to].vx -= dx * f;  pos[e.to].vy -= dy * f;
      }
      for (const n of nodes) {
        if (n.is_root) continue;
        pos[n.id].vx *= DAMPING; pos[n.id].vy *= DAMPING;
        pos[n.id].x = Math.max(50, Math.min(width  - 50, pos[n.id].x + pos[n.id].vx));
        pos[n.id].y = Math.max(50, Math.min(height - 50, pos[n.id].y + pos[n.id].vy));
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
    <svg width=${width} height=${height}
      style="display:block;width:100%;height:100%;background:transparent;">
      <defs>
        <marker id="arr" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="rgba(96,165,250,.5)" />
        </marker>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      ${edges.map((e, i) => {
        const from = positions[e.from], to = positions[e.to];
        if (!from || !to) return null;
        const thickness = 1 + (e.amount / maxEdgeAmount) * 3.5;
        const isHoveredEdge = hovered === e.from || hovered === e.to;
        return html`
          <line key=${i}
            x1=${from.x} y1=${from.y} x2=${to.x} y2=${to.y}
            stroke=${isHoveredEdge ? 'rgba(96,165,250,.7)' : 'rgba(96,165,250,.25)'}
            strokeWidth=${isHoveredEdge ? thickness + 1 : thickness}
            markerEnd="url(#arr)"
            style="transition:stroke .15s,stroke-opacity .15s;"
          />
        `;
      })}

      ${nodes.map(n => {
        const pos = positions[n.id];
        if (!pos) return null;
        const isRoot    = n.is_root;
        const isHov     = hovered === n.id;
        const r         = isRoot ? 20 : isHov ? 16 : 13;
        const fillColor = isRoot ? '#3b82f6' : '#1e293b';
        const stroke    = isRoot ? '#60a5fa' : isHov ? '#60a5fa' : '#334155';
        const label     = n.label || `#${n.id}`;
        const shortName = label.split(' ').slice(0, 2).join(' ');

        return html`
          <g key=${n.id}
            style="cursor:pointer;"
            onMouseEnter=${() => setHovered(n.id)}
            onMouseLeave=${() => setHovered(null)}>
            ${isRoot && html`
              <circle cx=${pos.x} cy=${pos.y} r=${r + 6}
                fill="none" stroke="rgba(59,130,246,.2)" strokeWidth="1"
                style="animation:ring-pulse 2s ease-in-out infinite;" />
            `}
            <circle cx=${pos.x} cy=${pos.y} r=${r}
              fill=${fillColor} stroke=${stroke} strokeWidth=${isRoot ? 1.5 : 1}
              filter=${isRoot ? 'url(#glow)' : 'none'}
              style="transition:r .12s,stroke .12s;" />
            <text x=${pos.x} y=${pos.y + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize=${isRoot ? 9 : 8} fontFamily="monospace"
              fill=${isRoot ? 'white' : '#94a3b8'} fontWeight="600">
              #${n.id}
            </text>
            ${(isRoot || isHov) && html`
              <text x=${pos.x} y=${pos.y + (isRoot ? 30 : 24)}
                textAnchor="middle" fontSize="10"
                fill=${isRoot ? 'var(--foreground)' : '#94a3b8'}
                fontWeight=${isRoot ? '600' : '400'}
                style="pointer-events:none;">
                ${shortName}
              </text>
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
  const [depth, setDepth]           = useState(1);
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [graph, setGraph]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const containerRef                = useRef(null);
  const [dims, setDims]             = useState({ w: 900, h: 520 });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.max(400, width), h: Math.max(300, height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  async function handleLoad() {
    const cid = parseInt(customerId);
    if (!cid) { toast.error('Enter a valid customer ID'); return; }
    setLoading(true); setGraph(null);
    try {
      const params = { customer_id: cid, depth };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const res = await api.customerNetwork(params);
      setGraph(res);
      if (!res.nodes.length) toast.info?.('No transfer connections found for this customer.');
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  const sortedEdges = graph
    ? [...graph.edges].sort((a, b) => b.amount - a.amount).slice(0, 10)
    : [];

  return html`
    <>
      <style>${`
        @keyframes ring-pulse {
          0%,100% { opacity:.6; transform:scale(1); }
          50% { opacity:.2; transform:scale(1.15); }
        }
      `}</style>

      <header className="topbar">
        <span className="topbar-title">Customer Network</span>
        <div className="topbar-right" style="display:flex;gap:8px;align-items:center;margin-left:auto;flex-wrap:wrap;">
          <input className="form-input" type="number" placeholder="Customer ID"
            style="width:130px;font-size:12px;height:30px;padding:0 10px;"
            value=${customerId} onChange=${e => setCustomerId(e.target.value)}
            onKeyDown=${e => e.key === 'Enter' && handleLoad()} />
          <select className="form-input"
            style="width:100px;font-size:12px;height:30px;padding:0 8px;"
            value=${depth} onChange=${e => setDepth(Number(e.target.value))}>
            <option value="1">Depth 1</option>
            <option value="2">Depth 2</option>
          </select>
          <input type="date" className="form-input"
            style="font-size:12px;height:30px;padding:0 8px;width:140px;"
            value=${dateFrom} onChange=${e => setDateFrom(e.target.value)} />
          <input type="date" className="form-input"
            style="font-size:12px;height:30px;padding:0 8px;width:140px;"
            value=${dateTo} onChange=${e => setDateTo(e.target.value)} />
          <button className="btn btn-primary btn-sm"
            onClick=${handleLoad} disabled=${loading || !customerId}
            style="display:flex;align-items:center;gap:5px;height:30px;">
            ${loading
              ? html`<${Spinner} size=${12} /> Loading…`
              : html`
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Load Graph
              `}
          </button>
        </div>
      </header>

      <div className="page" style="display:flex;gap:14px;height:calc(100vh - 120px);overflow:hidden;">

        <!-- Graph canvas -->
        <div className="card" style="flex:1;padding:0;overflow:hidden;position:relative;min-height:400px;"
          ref=${containerRef}>
          ${loading && html`
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);z-index:10;border-radius:inherit;">
              <${Spinner} size=${32} />
            </div>
          `}
          ${!graph && !loading && html`
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--muted-foreground);">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity=".4">
                <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/>
                <line x1="7" y1="11" x2="17" y2="6"/><line x1="7" y1="13" x2="17" y2="18"/>
              </svg>
              <div style="font-size:13px;font-weight:500;">Enter a customer ID to load the network</div>
              <div style="font-size:12px;">Displays transfer connections between customers</div>
            </div>
          `}
          ${graph && graph.nodes.length === 0 && html`
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--muted-foreground);">
              <div style="font-size:13px;font-weight:500;">No transfer connections found</div>
              <div style="font-size:12px;">Customer #${graph.customer_id} has no transfers within the selected date range.</div>
            </div>
          `}
          ${graph && graph.nodes.length > 0 && html`
            <${GraphCanvas}
              nodes=${graph.nodes}
              edges=${graph.edges}
              width=${dims.w}
              height=${dims.h}
            />
          `}
        </div>

        <!-- Stats sidebar -->
        ${graph && html`
          <div style="width:240px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;">

            <!-- Summary -->
            <div className="card" style="padding:14px;">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-foreground);margin-bottom:10px;">
                Graph Summary
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div style="text-align:center;padding:10px 6px;border-radius:6px;background:rgba(255,255,255,.03);border:1px solid var(--border);">
                  <div style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;">${graph.nodes.length}</div>
                  <div style="font-size:10px;color:var(--muted-foreground);margin-top:2px;">Nodes</div>
                </div>
                <div style="text-align:center;padding:10px 6px;border-radius:6px;background:rgba(255,255,255,.03);border:1px solid var(--border);">
                  <div style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;">${graph.edges.length}</div>
                  <div style="font-size:10px;color:var(--muted-foreground);margin-top:2px;">Edges</div>
                </div>
              </div>
            </div>

            <!-- Top connections -->
            ${sortedEdges.length > 0 && html`
              <div className="card" style="padding:0;overflow:hidden;flex:1;">
                <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-foreground);">
                  Top Transfers
                </div>
                <div style="overflow-y:auto;">
                  ${sortedEdges.map((e, i) => html`
                    <div key=${i} style=${{
                      padding: '8px 12px',
                      borderBottom: i < sortedEdges.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                        <span style="font-family:monospace;font-size:11px;color:var(--muted-foreground);">#${e.from}</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style="color:var(--muted-foreground);flex-shrink:0;">
                          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                        </svg>
                        <span style="font-family:monospace;font-size:11px;color:var(--muted-foreground);">#${e.to}</span>
                        <span style="font-size:10px;color:var(--muted-foreground);margin-left:auto;">${e.count}x</span>
                      </div>
                      <div style="font-size:12px;font-weight:600;color:var(--foreground);font-variant-numeric:tabular-nums;">
                        ${fmt.currency(e.amount)}
                      </div>
                    </div>
                  `)}
                </div>
              </div>
            `}
          </div>
        `}
      </div>
    </>
  `;
}
