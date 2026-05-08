import { html } from '../lib/html.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { fmt } from '../lib/utils.js';
import { Spinner } from '../components/Spinner.js';

// ─── Physics + Canvas Renderer ───────────────────────────────────────────────

function PhysicsGraph({ nodes, edges, onNodeSelect, selectedId }) {
  const canvasRef   = useRef(null);
  const simRef      = useRef({ nodes: [], edges: [], animId: null, drag: null, hovered: null });
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onNodeSelect);

  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { onSelectRef.current = onNodeSelect; }, [onNodeSelect]);

  // Initialize / reinitialize simulation when data changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes.length) return;

    const W = canvas.offsetWidth  || canvas.width;
    const H = canvas.offsetHeight || canvas.height;
    const cx = W / 2, cy = H / 2;

    const maxAmt = Math.max(...edges.map(e => e.amount), 1);

    // Build node map for O(1) lookup
    const sim = simRef.current;
    sim.edges = edges;
    sim.maxAmt = maxAmt;

    sim.nodes = nodes.map((n, i) => {
      const existing = sim.nodes.find(s => s.id === n.id);
      if (existing) return { ...existing, ...n };
      const angle = (i / nodes.length) * 2 * Math.PI;
      const r = n.is_root ? 18 : 12;
      // Start at evenly-spaced ring so repulsion doesn't collide
      const spread = n.is_root ? 0 : 80 + Math.random() * 30;
      return {
        ...n,
        r,
        x:  cx + Math.cos(angle) * spread,
        y:  cy + Math.sin(angle) * spread,
        vx: 0,
        vy: 0,
      };
    });
  }, [nodes, edges]);

  // Continuous animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const REPULSION       = 5500;
    const SPRING_LEN      = 130;
    const SPRING_K        = 0.014;
    const DAMPING         = 0.978;  // water-resistance feel
    const CENTER_F        = 0.0008;
    const THERMAL         = 0.002;  // barely perceptible drift
    const MAX_FORCE       = 6;      // cap per-pair repulsion so close nodes don't explode
    const MAX_VELOCITY    = 2.2;    // pixels/frame ceiling

    function tick() {
      const sim = simRef.current;
      if (!sim.nodes.length) {
        simRef.current.animId = requestAnimationFrame(tick);
        return;
      }

      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2;
      const ns = sim.nodes;

      // Reset forces
      ns.forEach(n => { n.fx = 0; n.fy = 0; });

      // Repulsion — capped so nodes that start close don't explode
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x;
          const dy = ns[j].y - ns[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const f  = Math.min(REPULSION / (dist * dist), MAX_FORCE);
          const fx = (dx / dist) * f, fy = (dy / dist) * f;
          ns[i].fx -= fx; ns[i].fy -= fy;
          ns[j].fx += fx; ns[j].fy += fy;
        }
      }

      // Spring forces along edges
      sim.edges.forEach(e => {
        const a = ns.find(n => n.id === e.from);
        const b = ns.find(n => n.id === e.to);
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f  = (dist - SPRING_LEN) * SPRING_K;
        const fx = (dx / dist) * f, fy = (dy / dist) * f;
        a.fx += fx; a.fy += fy;
        b.fx -= fx; b.fy -= fy;
      });

      // Integrate — velocity capped so no frame ever moves a node more than MAX_VELOCITY px
      ns.forEach(n => {
        if (sim.drag?.id === n.id) return;
        n.fx += (cx - n.x) * CENTER_F;
        n.fy += (cy - n.y) * CENTER_F;
        n.fx += (Math.random() - 0.5) * THERMAL;
        n.fy += (Math.random() - 0.5) * THERMAL;
        let vx = (n.vx + n.fx) * DAMPING;
        let vy = (n.vy + n.fy) * DAMPING;
        // hard velocity ceiling
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > MAX_VELOCITY) { vx = (vx / speed) * MAX_VELOCITY; vy = (vy / speed) * MAX_VELOCITY; }
        n.vx = vx; n.vy = vy;
        n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x + n.vx));
        n.y = Math.max(n.r + 4, Math.min(H - n.r - 4, n.y + n.vy));
      });

      // ── Draw ──────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = 'rgba(148,163,184,.03)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 70) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 70) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Vignette for depth
      const vig = ctx.createRadialGradient(cx, cy, W * 0.25, cx, cy, W * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

      // Advance pulse phase for root node animation
      sim.pulse = ((sim.pulse || 0) + 0.022) % (Math.PI * 2);

      const selId = selectedRef.current;

      // Edges
      sim.edges.forEach(e => {
        const a = ns.find(n => n.id === e.from);
        const b = ns.find(n => n.id === e.to);
        if (!a || !b) return;

        const isHighlit = a.id === selId || b.id === selId;
        const thick  = 0.8 + (e.amount / sim.maxAmt) * 3;
        const angle  = Math.atan2(b.y - a.y, b.x - a.x);
        const tx = b.x - Math.cos(angle) * (b.r + 5);
        const ty = b.y - Math.sin(angle) * (b.r + 5);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = isHighlit ? 'rgba(96,165,250,.7)' : 'rgba(96,165,250,.18)';
        ctx.lineWidth = isHighlit ? thick + 0.8 : thick;
        ctx.stroke();

        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - 9 * Math.cos(angle - 0.38), ty - 9 * Math.sin(angle - 0.38));
        ctx.lineTo(tx - 9 * Math.cos(angle + 0.38), ty - 9 * Math.sin(angle + 0.38));
        ctx.closePath();
        ctx.fillStyle = isHighlit ? 'rgba(96,165,250,.8)' : 'rgba(96,165,250,.3)';
        ctx.fill();
      });

      // Nodes
      ns.forEach(n => {
        const isSel  = n.id === selId;
        const isHov  = n.id === sim.hovered;
        const isRoot = n.is_root;
        const r = n.r + (isSel || isHov ? 2 : 0);

        // Outer glow
        if (isRoot || isSel || isHov) {
          const gr = ctx.createRadialGradient(n.x, n.y, r * .3, n.x, n.y, r * 2.6);
          const gc = isSel ? '251,191,36' : isRoot ? '59,130,246' : '100,116,139';
          gr.addColorStop(0, `rgba(${gc},.18)`);
          gr.addColorStop(1, `rgba(${gc},0)`);
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 2.6, 0, Math.PI * 2);
          ctx.fillStyle = gr; ctx.fill();
        }

        // Slow pulse ring on root node
        if (isRoot) {
          const pAlpha = 0.12 + 0.08 * Math.sin(sim.pulse);
          const pR = r + 4 + 3 * Math.sin(sim.pulse);
          ctx.beginPath(); ctx.arc(n.x, n.y, pR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(96,165,250,${pAlpha})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }

        // Node circle
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle   = isSel ? '#7c2d12' : isRoot ? '#1e40af' : '#0f172a';
        ctx.fill();
        ctx.strokeStyle = isSel ? '#fbbf24' : isRoot ? '#60a5fa' : isHov ? '#475569' : '#1e3a5f';
        ctx.lineWidth   = isSel ? 1.8 : isRoot ? 1.5 : 1;
        ctx.stroke();

        // ID label
        ctx.fillStyle = isSel ? '#fef3c7' : isRoot ? '#bfdbfe' : '#64748b';
        ctx.font = `${isRoot ? 600 : 500} ${isRoot ? 9 : 8}px ui-monospace,monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`#${n.id}`, n.x, n.y + 0.5);

        // Name label under node — only for root, selected, or hovered
        if (isRoot || isSel || isHov) {
          const lbl = (n.label || '').split(' ').slice(0, 2).join(' ') || `#${n.id}`;
          ctx.font = `${isSel ? 600 : 400} 10px ui-monospace,monospace`;
          ctx.fillStyle = isSel ? '#fde68a' : isRoot ? '#93c5fd' : '#475569';
          ctx.textBaseline = 'top';
          ctx.fillText(lbl, n.x, n.y + r + 4);
        }
      });

      simRef.current.animId = requestAnimationFrame(tick);
    }

    simRef.current.animId = requestAnimationFrame(tick);
    return () => { if (simRef.current.animId) cancelAnimationFrame(simRef.current.animId); };
  }, []);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, []);

  // Hit-test helper
  function nodeAt(x, y) {
    const ns = simRef.current.nodes;
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      const dx = x - n.x, dy = y - n.y;
      if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
    }
    return null;
  }

  function getXY(canvas, ev) {
    const rect = canvas.getBoundingClientRect();
    const src  = ev.touches ? ev.touches[0] : ev;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  // Mouse / touch events
  function onMouseDown(ev) {
    ev.preventDefault();
    const { x, y } = getXY(canvasRef.current, ev);
    const n = nodeAt(x, y);
    if (n) {
      simRef.current.drag = { id: n.id, ox: x - n.x, oy: y - n.y };
      simRef.current.dragNode = n;
    }
  }

  function onMouseMove(ev) {
    const { x, y } = getXY(canvasRef.current, ev);
    const drag = simRef.current.drag;
    if (drag) {
      const n = simRef.current.nodes.find(nd => nd.id === drag.id);
      if (n) { n.x = x - drag.ox; n.y = y - drag.oy; n.vx = 0; n.vy = 0; }
    } else {
      const hit = nodeAt(x, y);
      simRef.current.hovered = hit ? hit.id : null;
      canvasRef.current.style.cursor = hit ? 'pointer' : 'default';
    }
  }

  function onMouseUp(ev) {
    const drag = simRef.current.drag;
    const { x, y } = getXY(canvasRef.current, ev);
    const dragNode = simRef.current.dragNode;
    simRef.current.drag = null;
    simRef.current.dragNode = null;

    // Treat as click if mouse barely moved
    if (dragNode) {
      const n = simRef.current.nodes.find(nd => nd.id === dragNode.id);
      if (n && Math.abs(x - (n.x + (drag?.ox || 0))) < 6 && Math.abs(y - (n.y + (drag?.oy || 0))) < 6) {
        const cur = selectedRef.current;
        onSelectRef.current(cur === n.id ? null : n);
      }
    } else {
      const hit = nodeAt(x, y);
      if (hit) {
        const cur = selectedRef.current;
        onSelectRef.current(cur === hit.id ? null : hit);
      }
    }
  }

  return html`
    <canvas ref=${canvasRef}
      style="width:100%;height:100%;display:block;touch-action:none;"
      onMouseDown=${onMouseDown}
      onMouseMove=${onMouseMove}
      onMouseUp=${onMouseUp}
      onTouchStart=${onMouseDown}
      onTouchMove=${onMouseMove}
      onTouchEnd=${onMouseUp}
    />
  `;
}

// ─── Node Info Panel ──────────────────────────────────────────────────────────

function NodeInfo({ node, edges, onClose }) {
  if (!node) return null;

  const outgoing = edges.filter(e => e.from === node.id);
  const incoming = edges.filter(e => e.to === node.id);
  const totalSent = outgoing.reduce((s, e) => s + e.amount, 0);
  const totalRecv = incoming.reduce((s, e) => s + e.amount, 0);
  const connections = new Set([
    ...outgoing.map(e => e.to),
    ...incoming.map(e => e.from),
  ]).size;
  const txnCount = [...outgoing, ...incoming].reduce((s, e) => s + e.count, 0);

  const Row = ({ label, value, accent }) => html`
    <div style=${{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
      <span style=${{ fontSize:11, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em' }}>${label}</span>
      <span style=${{ fontSize:12, fontWeight:600, color: accent || '#f1f5f9', fontVariantNumeric:'tabular-nums' }}>${value}</span>
    </div>
  `;

  return html`
    <div style=${{
      background:'#0c1625', border:'1px solid #1e3a5f',
      borderRadius:10, overflow:'hidden',
      boxShadow:'0 8px 32px rgba(0,0,0,.6)',
    }}>
      <!-- Header -->
      <div style=${{ padding:'12px 14px', borderBottom:'1px solid #1e3a5f', display:'flex', alignItems:'center', justifyContent:'space-between', background: node.is_root ? 'rgba(29,78,216,.2)' : 'rgba(248,191,36,.08)' }}>
        <div style=${{ display:'flex', alignItems:'center', gap:8 }}>
          <div style=${{
            width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
            background: node.is_root ? '#1d4ed8' : '#78350f',
            border: `1.5px solid ${node.is_root ? '#60a5fa' : '#fbbf24'}`,
            fontSize:9, fontWeight:700, color: node.is_root ? '#e0f2fe' : '#fef3c7',
            fontFamily:'monospace', flexShrink:0,
          }}>#${node.id}</div>
          <div>
            <div style=${{ fontSize:13, fontWeight:600, color:'#f1f5f9', lineHeight:1.2 }}>
              ${node.label || `Customer #${node.id}`}
            </div>
            ${node.is_root && html`<div style=${{ fontSize:10, color:'#60a5fa', marginTop:1 }}>Root node</div>`}
          </div>
        </div>
        <button onClick=${onClose}
          style=${{ background:'none', border:'none', cursor:'pointer', color:'#475569', padding:4, lineHeight:1 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Stats -->
      <div style=${{ padding:'4px 14px 10px' }}>
        <${Row} label="Connections" value=${connections} />
        <${Row} label="Transactions" value=${txnCount} />
        <${Row} label="Total Sent"     value=${fmt.currency(totalSent)}    accent="#f87171" />
        <${Row} label="Total Received" value=${fmt.currency(totalRecv)}    accent="#4ade80" />
        <${Row} label="Net Flow"
          value=${fmt.currency(Math.abs(totalRecv - totalSent))}
          accent=${totalRecv >= totalSent ? '#4ade80' : '#f87171'} />
      </div>

      <!-- Connected nodes -->
      ${(outgoing.length > 0 || incoming.length > 0) && html`
        <div style=${{ borderTop:'1px solid #1e3a5f', padding:'10px 14px 12px' }}>
          <div style=${{ fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8 }}>Connections</div>
          ${[...outgoing.map(e => ({ ...e, dir:'out', peer: e.to })),
             ...incoming.map(e => ({ ...e, dir:'in',  peer: e.from }))]
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 6)
            .map((e, i) => html`
              <div key=${i} style=${{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                <span style=${{ fontSize:11, color: e.dir === 'out' ? '#f87171' : '#4ade80' }}>
                  ${e.dir === 'out' ? '→' : '←'}
                </span>
                <span style=${{ fontFamily:'monospace', fontSize:11, color:'#94a3b8' }}>#${e.peer}</span>
                <span style=${{ fontSize:10, color:'#334155', marginLeft:'auto', fontVariantNumeric:'tabular-nums' }}>
                  ${fmt.currency(e.amount)}
                </span>
              </div>
            `)
          }
        </div>
      `}
    </div>
  `;
}

// ─── Graph Summary ────────────────────────────────────────────────────────────

function GraphSummary({ graph }) {
  const totalVol = graph.edges.reduce((s, e) => s + e.amount, 0);
  const maxEdge  = graph.edges.reduce((m, e) => e.amount > m.amount ? e : m, graph.edges[0] || { amount: 0, from: '—', to: '—' });
  const totalTxn = graph.edges.reduce((s, e) => s + e.count, 0);

  // Compute degree (total connections) per node
  const deg = {};
  graph.nodes.forEach(n => deg[n.id] = 0);
  graph.edges.forEach(e => { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; });
  const topNode = Object.entries(deg).sort((a, b) => b[1] - a[1])[0];
  const topNodeLabel = topNode
    ? (graph.nodes.find(n => n.id == topNode[0])?.label || `#${topNode[0]}`).split(' ')[0]
    : '—';

  const Stat = ({ label, value, sub }) => html`
    <div style=${{ padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,.04)' }}>
      <div style=${{ fontSize:10, color:'#475569', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:3 }}>${label}</div>
      <div style=${{ fontSize:13, fontWeight:600, color:'#f1f5f9', fontVariantNumeric:'tabular-nums' }}>${value}</div>
      ${sub && html`<div style=${{ fontSize:10, color:'#334155', marginTop:1 }}>${sub}</div>`}
    </div>
  `;

  return html`
    <div style=${{ background:'#0c1625', border:'1px solid #1e3a5f', borderRadius:10, overflow:'hidden' }}>
      <div style=${{ padding:'10px 12px', borderBottom:'1px solid #1e3a5f', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.09em', color:'#334155' }}>
        Network Summary
      </div>
      <div style=${{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
        <${Stat} label="Customers" value=${graph.nodes.length} />
        <${Stat} label="Transfer Pairs" value=${graph.edges.length} />
      </div>
      <${Stat} label="Total Volume" value=${fmt.currency(totalVol)} sub=${`${totalTxn} transaction${totalTxn !== 1 ? 's' : ''}`} />
      <${Stat} label="Largest Transfer"
        value=${fmt.currency(maxEdge.amount)}
        sub=${maxEdge.from !== '—' ? `#${maxEdge.from} → #${maxEdge.to}` : ''} />
      <${Stat} label="Most Connected" value=${topNodeLabel} sub=${topNode ? `${topNode[1]} link${topNode[1] !== 1 ? 's' : ''}` : ''} />
    </div>
  `;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerNetwork() {
  const toast = useToast();
  const [customerId, setCustomerId] = useState('');
  const [depth, setDepth]           = useState(1);
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [graph, setGraph]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  async function handleLoad() {
    const cid = parseInt(customerId);
    if (!cid) { toast.error('Enter a valid customer ID'); return; }
    setLoading(true); setGraph(null); setSelectedNode(null);
    try {
      const params = { customer_id: cid, depth };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const res = await api.customerNetwork(params);
      setGraph(res);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  const handleNodeSelect = useCallback((nodeOrNull) => {
    if (!nodeOrNull) { setSelectedNode(null); return; }
    const full = graph?.nodes.find(n => n.id === nodeOrNull.id);
    setSelectedNode(full || nodeOrNull);
  }, [graph]);

  return html`
    <>
      <style>${`
        .net-canvas-wrap { background: #080d14; }
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
            ${loading ? html`<${Spinner} size=${12} /> Loading…` : html`
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Load Graph`}
          </button>
        </div>
      </header>

      <div className="page" style="display:flex;gap:12px;height:calc(100vh - 118px);overflow:hidden;padding-bottom:0;">

        <!-- Canvas area -->
        <div className="net-canvas-wrap"
          style="flex:1;border-radius:10px;border:1px solid #1e3a5f;overflow:hidden;position:relative;min-height:400px;">

          ${loading && html`
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(8,13,20,.7);z-index:10;border-radius:inherit;">
              <${Spinner} size=${32} />
            </div>
          `}

          ${!graph && !loading && html`
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;pointer-events:none;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="1">
                <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <line x1="7" y1="11" x2="10" y2="12"/><line x1="14" y1="12" x2="17" y2="6"/>
                <line x1="14" y1="12" x2="17" y2="18"/>
              </svg>
              <div style="font-size:13px;font-weight:500;color:#334155;">Enter a customer ID to visualize transfer connections</div>
              <div style="font-size:11px;color:#1e3a5f;">Click and drag nodes · Click to inspect · Nodes animate continuously</div>
            </div>
          `}

          ${graph && graph.nodes.length === 0 && html`
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;pointer-events:none;">
              <div style="font-size:13px;color:#334155;">No transfer connections for customer #${graph.customer_id}</div>
              <div style="font-size:11px;color:#1e3a5f;">Try removing the date filter or increasing depth</div>
            </div>
          `}

          ${graph && graph.nodes.length > 0 && html`
            <${PhysicsGraph}
              nodes=${graph.nodes}
              edges=${graph.edges}
              selectedId=${selectedNode?.id ?? null}
              onNodeSelect=${handleNodeSelect}
            />
          `}

          <!-- Legend -->
          ${graph && graph.nodes.length > 0 && html`
            <div style="position:absolute;bottom:12px;left:12px;display:flex;gap:12px;pointer-events:none;">
              <div style="display:flex;align-items:center;gap:5px;">
                <div style="width:10px;height:10px;border-radius:50%;background:#1d4ed8;border:1.5px solid #60a5fa;"></div>
                <span style="font-size:10px;color:#475569;">Root node</span>
              </div>
              <div style="display:flex;align-items:center;gap:5px;">
                <div style="width:10px;height:10px;border-radius:50%;background:#0f172a;border:1px solid #1e3a5f;"></div>
                <span style="font-size:10px;color:#475569;">Connected customer</span>
              </div>
              <div style="display:flex;align-items:center;gap:5px;">
                <div style="width:16px;height:1.5px;background:rgba(96,165,250,.5);"></div>
                <span style="font-size:10px;color:#475569;">Transfer (thicker = larger amount)</span>
              </div>
            </div>
          `}
        </div>

        <!-- Right panel -->
        ${graph && html`
          <div style="width:230px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;padding-right:2px;">
            <${GraphSummary} graph=${graph} />
            <${NodeInfo}
              node=${selectedNode}
              edges=${graph.edges}
              onClose=${() => setSelectedNode(null)}
            />
            ${!selectedNode && html`
              <div style="border:1px dashed #1e3a5f;border-radius:10px;padding:20px 14px;text-align:center;">
                <div style="font-size:11px;color:#334155;line-height:1.6;">
                  Click any node<br/>to inspect it
                </div>
              </div>
            `}
          </div>
        `}
      </div>
    </>
  `;
}
