const EMPTY = '-';

export const fmt = {
  currency: (n) => n == null ? EMPTY : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n),
  date:     (s) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : EMPTY,
  datetime: (s) => s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : EMPTY,
  initials: (name) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?',
  num:      (n) => n == null ? EMPTY : new Intl.NumberFormat('en').format(n),
};

export const statusVariant = (s) => {
  const m = { active:'badge-green', open:'badge-green', closed:'badge-gray', inactive:'badge-gray', disabled:'badge-gray', suspended:'badge-amber', locked:'badge-amber', flagged:'badge-red', pending:'badge-amber' };
  return m[s?.toLowerCase()] || 'badge-gray';
};

export const txVariant = (t) => {
  const m = { deposit:'badge-green', credit:'badge-green', withdrawal:'badge-red', debit:'badge-red', transfer:'badge-blue' };
  return m[t?.toLowerCase()] || 'badge-gray';
};

export const roleVariant = (r) => {
  const m = { manager:'role-manager', teller:'role-teller', auditor:'role-auditor' };
  return m[r?.toLowerCase()] || 'badge-gray';
};

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const getParam = (n) => new URLSearchParams(window.location.search).get(n);


