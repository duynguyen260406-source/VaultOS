import { html } from '../lib/html.js';
import { Link } from 'react-router-dom';

export default function Page403() {
  return html`
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px;">
      <div style="width:64px;height:64px;border-radius:16px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);display:flex;align-items:center;justify-content:center;margin-bottom:24px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h1 style="font-size:40px;font-weight:700;color:#ef4444;margin-bottom:8px;">403</h1>
      <p style="font-size:16px;font-weight:500;margin-bottom:8px;">Access denied</p>
      <p style="font-size:14px;color:var(--body-muted);max-width:320px;line-height:1.6;margin-bottom:24px;">
        You don't have permission to view this page. Please contact your administrator.
      </p>
      <${Link} to="/dashboard" className="btn btn-primary">Go to Dashboard<//>
    </div>
  `;
}


