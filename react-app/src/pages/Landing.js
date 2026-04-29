import { html } from '../lib/html.js';
import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';

function DottedSurface() {
  const containerRef = useRef(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const SEPARATION = 150, AMOUNTX = 40, AMOUNTY = 60;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.set(0, 355, 1220);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    const positions = [], colors = [];
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions.push(ix * SEPARATION - (AMOUNTX * SEPARATION) / 2, 0, iy * SEPARATION - (AMOUNTY * SEPARATION) / 2);
        colors.push(82 / 255, 82 / 255, 82 / 255);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 9, vertexColors: true, transparent: true, opacity: 0.75, sizeAttenuation: true });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    let count = 0, animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const pos = geometry.attributes.position;
      const arr = pos.array;
      let i = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          arr[i * 3 + 1] = Math.sin((ix + count) * 0.3) * 50 + Math.sin((iy + count) * 0.5) * 50;
          i++;
        }
      }
      pos.needsUpdate = true;
      renderer.render(scene, camera);
      count += 0.1;
    };
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    animate();
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);
  return html`<div ref=${containerRef} style=${{position:'fixed',inset:0,zIndex:0,pointerEvents:'none'}}></div>`;
}

export default function Landing() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const openModal = () => { setShowModal(true); setError(''); setUsername(''); setPassword(''); setShowPw(false); };
  const closeModal = () => { if (!loading) { setShowModal(false); setError(''); } };

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user]);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'landing-style';
    style.textContent = `
      @keyframes fadeInUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
      @keyframes float{0%,100%{transform:translateY(0px)}33%{transform:translateY(-7px)}66%{transform:translateY(-3px)}}
      @property --angle{syntax:'<angle>';inherits:false;initial-value:0deg}
      @keyframes spin-gradient{to{--angle:360deg}}
      .fade-in{animation:fadeInUp .9s cubic-bezier(.16,1,.3,1) both}
      .d1{animation-delay:.05s}.d2{animation-delay:.15s}.d3{animation-delay:.25s}.d4{animation-delay:.38s}.d5{animation-delay:.52s}
      .card-float{animation:float 7s ease-in-out infinite}
      .text-gradient-blue{background:linear-gradient(120deg,#f0ede8 0%,#d4c9bb 30%,#a89888 55%,#c8bdb2 80%,#f0ede8 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
      .display{font-family:'DM Serif Display',Georgia,serif}
      @property --gradient-angle{syntax:'<angle>';initial-value:0deg;inherits:false}
      @property --gradient-angle-offset{syntax:'<angle>';initial-value:0deg;inherits:false}
      @property --gradient-percent{syntax:'<percentage>';initial-value:5%;inherits:false}
      @property --gradient-shine{syntax:'<color>';initial-value:white;inherits:false}
      .shiny-cta{
        --shiny-cta-bg:#05060f;--shiny-cta-bg-subtle:#111111;--shiny-cta-fg:#fafafa;
        --shiny-cta-highlight:rgba(255,255,255,.72);--shiny-cta-highlight-subtle:rgba(255,255,255,.36);
        --anim:gradient-angle linear infinite;--dur:3s;--shadow-size:2px;
        --tr:800ms cubic-bezier(.25,1,.5,1);
        isolation:isolate;position:relative;overflow:hidden;cursor:pointer;
        outline-offset:4px;padding:.85rem 2.2rem;font-family:inherit;font-size:1rem;
        line-height:1.2;font-weight:500;border:1px solid transparent;border-radius:360px;
        color:var(--shiny-cta-fg);
        background:linear-gradient(var(--shiny-cta-bg),var(--shiny-cta-bg)) padding-box,
          conic-gradient(from calc(var(--gradient-angle) - var(--gradient-angle-offset)),
            transparent,var(--shiny-cta-highlight) var(--gradient-percent),
            var(--gradient-shine) calc(var(--gradient-percent)*2),
            var(--shiny-cta-highlight) calc(var(--gradient-percent)*3),
            transparent calc(var(--gradient-percent)*4)) border-box;
        box-shadow:inset 0 0 0 1px var(--shiny-cta-bg-subtle);
        transition:var(--tr);transition-property:--gradient-angle-offset,--gradient-percent,--gradient-shine;
        animation:var(--anim) var(--dur),var(--anim) calc(var(--dur)/.4) reverse paused;
        animation-composition:add;
      }
      .shiny-cta::before,.shiny-cta::after,.shiny-cta span::before{
        content:'';pointer-events:none;position:absolute;inset-inline-start:50%;inset-block-start:50%;
        translate:-50% -50%;z-index:-1;
      }
      .shiny-cta:active{translate:0 1px}
      .shiny-cta::before{
        --size:calc(100% - var(--shadow-size)*3);--pos:2px;--space:calc(var(--pos)*2);
        width:var(--size);height:var(--size);
        background:radial-gradient(circle at var(--pos) var(--pos),white calc(var(--pos)/4),transparent 0) padding-box;
        background-size:var(--space) var(--space);background-repeat:space;
        mask-image:conic-gradient(from calc(var(--gradient-angle) + 45deg),black,transparent 10% 90%,black);
        border-radius:inherit;opacity:.4;z-index:-1;
        animation:var(--anim) var(--dur),var(--anim) calc(var(--dur)/.4) reverse paused;
        animation-composition:add;
      }
      .shiny-cta::after{
        --anim:shimmer linear infinite;
        width:100%;aspect-ratio:1;
        background:linear-gradient(-50deg,transparent,var(--shiny-cta-highlight),transparent);
        mask-image:radial-gradient(circle at bottom,transparent 40%,black);
        opacity:.6;
        animation:var(--anim) var(--dur),var(--anim) calc(var(--dur)/.4) reverse paused;
        animation-composition:add;
      }
      .shiny-cta span{z-index:1;display:flex;align-items:center;gap:8px}
      .shiny-cta span::before{
        --size:calc(100% + 1rem);width:var(--size);height:var(--size);
        box-shadow:inset 0 -1ex 2rem 4px var(--shiny-cta-highlight);
        opacity:0;transition:opacity var(--tr);
        animation:calc(var(--dur)*1.5) breathe linear infinite;
      }
      .shiny-cta:is(:hover,:focus-visible){--gradient-percent:20%;--gradient-angle-offset:95deg;--gradient-shine:var(--shiny-cta-highlight-subtle)}
      .shiny-cta:is(:hover,:focus-visible),.shiny-cta:is(:hover,:focus-visible)::before,.shiny-cta:is(:hover,:focus-visible)::after{animation-play-state:running}
      .shiny-cta:is(:hover,:focus-visible) span::before{opacity:1}
      @keyframes gradient-angle{to{--gradient-angle:360deg}}
      @keyframes shimmer{to{rotate:360deg}}
      @keyframes breathe{from,to{scale:1}50%{scale:1.2}}
      #landing-nav{position:fixed;top:0;left:0;right:0;z-index:1000;height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:rgba(10,10,10,.82);backdrop-filter:blur(16px) saturate(1.5);border-bottom:1px solid #262626}
      .landing-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:rgba(255,255,255,.05);border:1px solid #262626;border-radius:100px;font-size:12px;color:#a1a1a1}
      .auth-card{background:linear-gradient(148deg,#111111 0%,#0a0a0a 60%,#080808 100%);border:1px solid #262626;border-radius:16px;box-shadow:0 0 0 1px rgba(255,255,255,.03),0 32px 80px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.04)}
      .auth-input{background:rgba(255,255,255,.05);border:1px solid #262626;border-radius:8px;color:#fafafa;padding:10px 14px;width:100%;outline:none;font-size:14px;font-family:inherit;transition:border-color .15s,box-shadow .15s}
      .auth-input::placeholder{color:#525252}
      .auth-input:focus{border-color:#525252;box-shadow:0 0 0 3px rgba(255,255,255,.04)}
      .auth-divider{display:flex;align-items:center;gap:12px;color:#525252;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
      .auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:#262626}
      @media(prefers-reduced-motion:reduce){.fade-in{opacity:1;animation:none}.card-float{animation:none}}
    `;
    document.head.appendChild(style);
    return () => document.getElementById('landing-style')?.remove();
  }, []);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setShowModal(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div style="background:#05060f;min-height:100vh;color:#fafafa;overflow-x:hidden;font-family:'Untitled Sans',system-ui,sans-serif;">
      <${DottedSurface} />

      <div style="position:relative;z-index:1;">

        <section style="position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:128px 24px 80px;overflow:hidden;text-align:center;">
          <div style="position:absolute;width:900px;height:600px;top:-80px;left:50%;transform:translateX(-50%);background:radial-gradient(ellipse,rgba(255,255,255,.03) 0%,transparent 60%);pointer-events:none;"></div>

          <h1 className="fade-in d2 display" style="font-size:clamp(48px,8vw,96px);font-weight:400;line-height:1.0;letter-spacing:-.03em;max-width:860px;margin-bottom:24px;">
            Vault OS<br/>
            <em className="display text-gradient-blue" style="font-style:italic;font-weight:400;font-size:.54em;letter-spacing:-.025em;opacity:.65;">Fast, Secure & Convenient</em>
          </h1> 

          <div className="fade-in d4" style="margin-bottom:48px;">
            <button className="shiny-cta" onClick=${openModal}>
              <span>
                Sign in
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
              </span>
            </button>
          </div>

        </section>

        <div className=${'modal-backdrop' + (showModal ? ' modal-backdrop--open' : '')} onClick=${e => { if (e.target === e.currentTarget) closeModal(); }} style=${{position:'fixed',inset:0,zIndex:800,background:'rgba(0,0,0,.6)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',opacity:showModal?1:0,visibility:showModal?'visible':'hidden',pointerEvents:showModal?'all':'none',transition:'opacity .22s, visibility .22s'}}>
          <div style=${{width:'100%',maxWidth:'400px',background:'linear-gradient(148deg,#111111 0%,#0a0a0a 60%,#080808 100%)',border:'1px solid #262626',borderRadius:'16px',boxShadow:'0 0 0 1px rgba(255,255,255,.03),0 32px 80px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.04)',padding:'28px',position:'relative',transform:showModal?'translateY(0) scale(1)':'translateY(16px) scale(.97)',transition:'transform .28s cubic-bezier(.22,1,.36,1), opacity .22s',opacity:showModal?1:0}}>

            <button onClick=${closeModal} style=${{position:'absolute',top:'14px',right:'14px',background:'none',border:'none',color:'#525252',cursor:'pointer',display:'flex',alignItems:'center',padding:'4px',borderRadius:'6px',transition:'color .15s'}} onMouseOver=${e=>e.currentTarget.style.color='#fafafa'} onMouseOut=${e=>e.currentTarget.style.color='#525252'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px;">
              <div style="width:36px;height:36px;border-radius:8px;border:1px solid #262626;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                <img src="/brand_assets/ChatGPT%20Image%2010_29_53%2026%20thg%204%2C%202026.png" alt="" style="width:24px;height:24px;object-fit:contain;" />
              </div>
            </div>
            <div style="text-align:center;margin-bottom:22px;">
              <h2 style="font-size:16px;font-weight:600;color:#fafafa;margin:0 0 5px;letter-spacing:-.02em;">Welcome back</h2>
              <p style="font-size:13px;color:#525252;margin:0;">Enter your credentials to access VaultOS.</p>
            </div>

            ${error && html`
              <div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;border:1px solid rgba(239,68,68,.2);background:rgba(239,68,68,.08);color:#fca5a5;font-size:12px;">
                ${error}
              </div>
            `}

            <form onSubmit=${handleSubmit} style="display:flex;flex-direction:column;gap:10px;">
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-size:11.5px;color:#a1a1a1;font-weight:500;">Username</label>
                <input type="text" className="auth-input" placeholder="Enter your username" value=${username} onChange=${e => setUsername(e.target.value)} autoComplete="username" required />
              </div>

              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-size:11.5px;color:#a1a1a1;font-weight:500;">Password</label>
                <div style="position:relative;">
                  <input
                    type=${showPw ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="Enter your password"
                    value=${password}
                    onChange=${e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    style="padding-right:42px;"
                  />
                  <button type="button" onClick=${() => setShowPw(v => !v)} style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#525252;cursor:pointer;display:flex;align-items:center;padding:0;">
                    ${showPw
                      ? html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
                      : html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
                    }
                  </button>
                </div>
              </div>

              <button type="submit" disabled=${loading} style=${{background:'#fafafa',borderRadius:'8px',padding:'10px 16px',fontSize:'14px',fontWeight:'500',color:'#0a0a0a',cursor:loading?'not-allowed':'pointer',width:'100%',border:'none',fontFamily:'inherit',letterSpacing:'-.01em',transition:'opacity .15s,transform .15s',marginTop:'4px',opacity:loading?.6:1}}>
                ${loading ? 'Signing in...' : 'Continue'}
              </button>
            </form>

            <div className="auth-divider" style="margin:16px 0 12px;">staff login</div>
            <p style="text-align:center;font-size:12px;color:#525252;margin:0;">
              Don't have access? <a href="#" style="color:#a1a1a1;border-bottom:1px solid rgba(161,161,161,.25);">Contact your administrator</a>
            </p>
          </div>
        </div>

      </div>
    </div>
  `;
}

