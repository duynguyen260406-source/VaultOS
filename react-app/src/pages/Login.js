import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate('/dashboard', { replace: true }); }, [user]);

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
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;overflow:hidden;position:relative;">
      <div style="position:fixed;width:700px;height:500px;top:-100px;left:50%;transform:translateX(-50%);background:radial-gradient(ellipse,rgba(122,223,46,.05) 0%,transparent 60%);pointer-events:none;"></div>
      <div style="position:fixed;width:600px;height:400px;top:30%;left:10%;background:radial-gradient(ellipse,rgba(186,214,247,.04) 0%,transparent 60%);pointer-events:none;"></div>

      <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:var(--blue-6);border:1px solid var(--blue-12);border-radius:100px;font-size:11.5px;color:var(--body-muted);margin-bottom:28px;">
        <span style="width:6px;height:6px;border-radius:50%;background:#7adf2e;box-shadow:0 0 7px rgba(122,223,46,.9);display:block;flex-shrink:0;"></span>
        Banking Management System - Staff Portal
      </div>

      <h1 style="font-size:clamp(32px,5vw,52px);font-weight:400;letter-spacing:-.03em;text-align:center;margin-bottom:8px;font-family:'DM Serif Display',Georgia,serif;">
        Welcome back
      </h1>
      <p style="font-size:14px;color:var(--body-muted);margin-bottom:36px;text-align:center;">Sign in to your staff account to continue.</p>

      <div style="width:100%;max-width:370px;">
        <div style="background:linear-gradient(148deg,#0d0f22 0%,#080a18 100%);border:1px solid var(--blue-12);border-radius:14px;padding:26px;box-shadow:0 32px 80px rgba(0,0,0,.7),inset 0 1px 0 rgba(186,214,247,.05);">
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:22px;">
            <img src="/brand_assets/ChatGPT%20Image%2010_29_53%2026%20thg%204%2C%202026.png" style="width:20px;height:20px;object-fit:contain;border-radius:4px;" alt="" />
            <span style="font-size:13.5px;font-weight:500;letter-spacing:-.01em;">Sign in to VaultOS</span>
          </div>

          ${error && html`<div className="alert alert-danger" style="margin-bottom:14px;">${error}</div>`}

          <form onSubmit=${handleSubmit} style="display:flex;flex-direction:column;gap:11px;">
            <div className="form-group">
              <label className="form-label">Username</label>
              <input type="text" className="form-input" value=${username} onChange=${e => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style="position:relative;">
                <input
                  type=${showPw ? 'text' : 'password'}
                  className="form-input"
                  value=${password}
                  onChange=${e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  style="padding-right:40px;"
                />
                <button type="button" onClick=${() => setShowPw(v => !v)} style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--body-muted);cursor:pointer;display:flex;align-items:center;padding:0;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    ${showPw
                      ? html`<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`
                      : html`<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
                    }
                  </svg>
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled=${loading} style="margin-top:4px;">
              ${loading ? 'Signing in...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  `;
}



