import { html } from '../lib/html.js';
import { useRef, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { fmt } from '../lib/utils.js';

const ITEMS = [
  { label: 'Dashboard', path: '/dashboard', roles: ['manager','teller','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>` },
  { section: 'Operations' },
  { label: 'Customers', path: '/customers', roles: ['manager','teller','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` },
  { label: 'Accounts', path: '/accounts', roles: ['manager','teller','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>` },
  { label: 'Transactions', path: '/transactions', roles: ['manager','teller'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>` },
  { label: 'Approvals', path: '/approvals', roles: ['manager','teller','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>` },
  { label: 'End of Day', path: '/eod', roles: ['manager','teller'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>` },
  { label: 'Loans', path: '/loans', roles: ['manager','teller','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>` },
  { label: 'Watchlist', path: '/watchlist', roles: ['manager','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>` },
  { section: 'Analytics' },
  { label: 'Reports', path: '/reports', roles: ['manager','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>` },
  { label: 'Audit & Risk', path: '/audit', roles: ['manager','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>` },
  { label: 'Audit Cases', path: '/cases', roles: ['manager','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>` },
  { label: 'Regulatory', path: '/regulatory', roles: ['manager','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="18" x2="12" y2="18"/></svg>` },
  { label: 'Sanctions', path: '/sanctions', roles: ['manager','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>` },
  { label: 'Network Graph', path: '/network', roles: ['manager','auditor'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><line x1="7" y1="11" x2="17" y2="6"/><line x1="7" y1="13" x2="17" y2="18"/></svg>` },
  { section: 'Administration' },
  { label: 'Admin Panel', path: '/admin', roles: ['manager'],
    icon: html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>` },
];

const roleMap = { manager: 'role-manager', teller: 'role-teller', auditor: 'role-auditor' };

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const role = user?.role;

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return html`
    <aside className=${'sidebar' + (open ? ' open' : '')}>
      <div className="sidebar-head">
        <img src="/brand_assets/ChatGPT%20Image%2010_29_53%2026%20thg%204%2C%202026.png" className="sidebar-logo" alt="VaultOS" />
        <span className="sidebar-brand">VaultOS</span>
      </div>

      <nav className="sidebar-nav">
        ${ITEMS.map((item, i) => {
          if (item.section) return html`<div key=${i} className="nav-section">${item.section}</div>`;
          if (!item.roles.includes(role)) return null;
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return html`
            <${Link}
              key=${i}
              to=${item.path}
              className=${'nav-item' + (active ? ' active' : '')}
              onClick=${onClose}
            >
              ${item.icon}
              <span>${item.label}</span>
            <//>
          `;
        })}
      </nav>

      <div className="sidebar-foot">
        <div className="user-tile">
          <div className="user-avatar">${fmt.initials(user?.username)}</div>
          <div className="user-info">
            <div className="user-name">${user?.username}</div>
            <div className="user-sub">
              <span className=${'badge ' + (roleMap[role] || '')} style="font-size:9.5px;padding:1px 6px;">${role}</span>
            </div>
          </div>
          <${Link} to="/profile" className="logout-btn" title="My profile" onClick=${onClose}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
          <//>
          <button className="logout-btn" onClick=${handleLogout} title="Sign out">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>
    </aside>
  `;
}



