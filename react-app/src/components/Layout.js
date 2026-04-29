import { html } from '../lib/html.js';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.js';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return html`
    <div className="app">
      <button
        className="mobile-nav-toggle"
        onClick=${() => setSidebarOpen(true)}
        title="Open navigation"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6"/>
          <line x1="4" y1="12" x2="20" y2="12"/>
          <line x1="4" y1="18" x2="20" y2="18"/>
        </svg>
      </button>

      <${Sidebar} open=${sidebarOpen} onClose=${() => setSidebarOpen(false)} />

      <div className="main">
        <${Outlet} />
      </div>
    </div>
  `;
}


