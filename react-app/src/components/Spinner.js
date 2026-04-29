import { html } from '../lib/html.js';

export function Spinner({ large }) {
  return html`<span className=${'spinner' + (large ? ' spinner-lg' : '')} />`;
}

export function LoadingRow({ cols }) {
  return html`
    <tr>
      <td colSpan=${cols} style="padding:40px;text-align:center;">
        <${Spinner} />
      </td>
    </tr>
  `;
}

export function EmptyState({ icon, title, text, action }) {
  return html`
    <div className="empty-state">
      ${icon && html`<div className="empty-icon-wrap">${icon}</div>`}
      ${title && html`<div className="empty-state-title">${title}</div>`}
      ${text  && html`<div className="empty-state-text">${text}</div>`}
      ${action}
    </div>
  `;
}

export function Badge({ variant, children }) {
  return html`<span className=${'badge ' + variant}>${children}</span>`;
}

export function StatusBadge({ status }) {
  const m = { active:'badge-green', open:'badge-green', closed:'badge-gray', inactive:'badge-gray', disabled:'badge-gray', suspended:'badge-amber', locked:'badge-amber', flagged:'badge-red', pending:'badge-amber' };
  return html`<span className=${'badge ' + (m[status?.toLowerCase()] || 'badge-gray')}>${status || '-'}</span>`;
}

export function TxBadge({ type }) {
  const m = { deposit:'badge-green', credit:'badge-green', withdrawal:'badge-red', debit:'badge-red', transfer:'badge-blue' };
  return html`<span className=${'badge ' + (m[type?.toLowerCase()] || 'badge-gray')}>${type || '-'}</span>`;
}

export function RoleBadge({ role }) {
  const m = { manager:'role-manager', teller:'role-teller', auditor:'role-auditor' };
  return html`<span className=${'badge ' + (m[role?.toLowerCase()] || 'badge-gray')}>${role || '-'}</span>`;
}


