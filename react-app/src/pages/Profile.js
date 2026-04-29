import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { api } from '../lib/api.js';
import { Spinner, RoleBadge } from '../components/Spinner.js';

export default function Profile() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState('');

  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.me().then(setMe).catch(e => setMeError(e.message));
  }, []);

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError(''); setPwSuccess(false);
    if (!current || !newPw || !confirm) { setPwError('All fields are required.'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirm) { setPwError('New passwords do not match.'); return; }
    setSaving(true);
    try {
      await api.changePwd({ current_password: current, new_password: newPw });
      setPwSuccess(true);
      setCurrent(''); setNewPw(''); setConfirm('');
      toast.success('Password changed. Please sign in again.');
      setTimeout(async () => {
        await logout();
        navigate('/login', { replace: true });
      }, 1800);
    } catch (e) { setPwError(e.message); }
    finally { setSaving(false); }
  }

  return html`
    <>
      <header className="topbar"><span className="topbar-title">My Profile</span></header>
      <div className="page">
        <div style="max-width:480px;">
          <div className="card" style="margin-bottom:16px;">
            ${meError && html`<div className="alert alert-danger">${meError}</div>`}
            ${!me && !meError && html`<div className="empty-state"><${Spinner} /></div>`}
            ${me && html`
              <div style="display:flex;align-items:center;gap:14px;">
                <div style="width:44px;height:44px;border-radius:11px;background:var(--blue-12);border:1px solid var(--blue-24);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--blue-90);">
                  ${me.username.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style="font-size:16px;font-weight:600;letter-spacing:-.02em;">${me.username}</div>
                  <div style="margin-top:4px;"><${RoleBadge} role=${me.role} /></div>
                </div>
              </div>
            `}
          </div>

          <div className="card">
            <h3 style="font-size:14px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Change password
            </h3>
            <form onSubmit=${handleChangePassword} style="display:flex;flex-direction:column;gap:12px;">
              <div className="form-group">
                <label className="form-label">Current password <span className="form-req">*</span></label>
                <input type="password" className="form-input" value=${current} onChange=${e => setCurrent(e.target.value)} autoComplete="current-password" />
              </div>
              <div className="form-group">
                <label className="form-label">New password <span className="form-req">*</span></label>
                <input type="password" className="form-input" value=${newPw} onChange=${e => setNewPw(e.target.value)} autoComplete="new-password" placeholder="Minimum 8 characters" />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm new password <span className="form-req">*</span></label>
                <input type="password" className="form-input" value=${confirm} onChange=${e => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              ${pwError && html`<div className="alert alert-danger">${pwError}</div>`}
              ${pwSuccess && html`<div className="alert alert-success">Password changed successfully.</div>`}
              <button type="submit" className="btn btn-primary" style="align-self:flex-start;" disabled=${saving}>
                ${saving ? html`<${Spinner} />` : 'Update password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  `;
}


