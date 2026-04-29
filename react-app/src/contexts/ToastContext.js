import { html } from '../lib/html.js';
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

const ICONS = {
  success: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  error:   html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info:    html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const show = useCallback((type, message, ms = 4000) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ms);
  }, []);

  const toast = {
    success: (m) => show('success', m),
    error:   (m) => show('error', m),
    info:    (m) => show('info', m),
    warning: (m) => show('warning', m),
  };

  return html`
    <${ToastContext.Provider} value=${toast}>
      ${children}
      <div id="toast-root">
        ${toasts.map(t => html`
          <div key=${t.id} className=${'toast toast-' + t.type}>
            ${ICONS[t.type]}
            <span>${t.message}</span>
          </div>
        `)}
      </div>
    <//>
  `;
}

export const useToast = () => useContext(ToastContext);


