import { html } from '../lib/html.js';
import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, footer, large }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && open) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return html`
    <div className=${'overlay' + (open ? '' : ' hidden')}>
      <div className=${'modal' + (large ? ' modal-lg' : '')}>
        <div className="modal-head">
          <span className="modal-title">${title}</span>
          <button className="modal-close" onClick=${onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">${children}</div>
        ${footer && html`<div className="modal-foot">${footer}</div>`}
      </div>
    </div>
  `;
}


