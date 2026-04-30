import { clearAuth } from './auth.js';
import {
  clearDataCache,
  clearInflightValue,
  getCachedValue,
  getInflightValue,
  setCachedValue,
  setInflightValue,
} from './dataCache.js';

// Use localhost:8000 when running on a non-API dev server (e.g. serve.py on :3000)
const fallbackApi = (window.location.protocol === 'file:' || window.location.port === '3000')
  ? 'http://localhost:8000'
  : window.location.origin;
const envApi = import.meta.env.VITE_API_BASE_URL?.trim();
const runtimeApi = window.__API_BASE_URL__?.trim();
export const API = (envApi || runtimeApi || fallbackApi).replace(/\/+$/, '');
const GET_CACHE_TTL_MS = 30_000;

function readCookie(name) {
  return document.cookie
    .split(';')
    .map(v => v.trim())
    .find(v => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function req(method, path, body = null, options = {}) {
  const verb = method.toUpperCase();
  const cacheKey = `${verb}:${path}`;
  const useCache = verb === 'GET' && options.cache !== 'reload';

  if (useCache) {
    const cached = getCachedValue(cacheKey, options.ttlMs ?? GET_CACHE_TTL_MS);
    if (cached !== undefined) return cached;
    const inflight = getInflightValue(cacheKey);
    if (inflight) return inflight;
  }

  const run = async () => {
    const headers = { 'Content-Type': 'application/json' };
    const csrf = readCookie('vaultos_csrf');
    if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(verb)) {
      headers['X-CSRF-Token'] = decodeURIComponent(csrf);
    }

    let res;
    try {
      res = await fetch(`${API}${path}`, {
        method: verb,
        headers,
        credentials: 'include',
        ...(body !== null ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error('Cannot reach the API server. Is the backend running?');
    }

    if (res.status === 401) {
      clearAuth();
      window.location.hash = '/login';
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.detail;
      const msg = Array.isArray(detail) ? detail.map(d => d.msg || d).join(', ')
                 : typeof detail === 'string' ? detail
                 : 'Request failed';
      throw new Error(msg);
    }

    if (useCache) {
      setCachedValue(cacheKey, data);
    } else if (!['HEAD', 'OPTIONS'].includes(verb)) {
      clearDataCache();
    }
    return data;
  };

  const promise = run().finally(() => {
    if (useCache) clearInflightValue(cacheKey);
  });
  if (useCache) setInflightValue(cacheKey, promise);
  return promise;
}

const qs = (p = {}) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined && v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
};

export const api = {
  login:         (d)        => req('POST', '/auth/login', d),
  logout:        ()         => req('POST', '/auth/logout'),
  me:            ()         => req('GET',  '/auth/me'),
  changePwd:     (d)        => req('POST', '/auth/change-password', d),

  listCustomers: (p={})     => req('GET',  `/customers${qs(p)}`),
  searchCustomers:(name)    => req('GET',  `/customers/search${qs({name})}`),
  getCustomer:   (id)       => req('GET',  `/customers/${id}`),
  createCustomer:(d)        => req('POST', '/customers', d),
  getCustomerAccounts:(id)  => req('GET',  `/customers/${id}/accounts`),

  searchAccounts:(q)        => req('GET',  `/accounts/search${qs({q})}`),
  getAccount:    (id)       => req('GET',  `/accounts/${id}`),
  openAccount:   (d)        => req('POST', '/accounts', d),
  closeAccount:  (id)       => req('DELETE',`/accounts/${id}`),
  getTransactions:(id,p={}) => req('GET',  `/accounts/${id}/transactions${qs(p)}`),

  deposit:       (d)        => req('POST', '/transactions/deposit', d),
  withdraw:      (d)        => req('POST', '/transactions/withdraw', d),
  transfer:      (d)        => req('POST', '/transactions/transfer', d),

  dailyReport:           (p={}) => req('GET',  `/reports/daily-transactions${qs(p)}`),
  dailyReportRange:      (p={}) => req('GET',  `/reports/daily-transactions-range${qs(p)}`),
  dailyReportDetail:     (p={}) => req('GET',  `/reports/daily-transactions-detail${qs(p)}`),
  dashboardSummary:      ()     => req('GET',  '/reports/dashboard-summary'),
  balancesReport:        ()     => req('GET',  '/reports/customer-balances'),
  branchReport:          ()     => req('GET',  '/reports/branch-activity'),
  branchTransactionStats:()     => req('GET',  '/reports/branch-transactions'),

  listUsers:     ()         => req('GET',  '/users'),
  createUser:    (d)        => req('POST', '/users', d),
  updateUser:    (id,d)     => req('PATCH',`/users/${id}`, d),
  resetPwd:      (id,d)     => req('POST', `/users/${id}/reset-password`, d),
  unlockUser:    (id)       => req('POST', `/users/${id}/unlock`),

  listEmployees: (p={})     => req('GET',  `/employees${qs(p)}`),
  createEmployee:(d)        => req('POST', '/employees', d),
  updateEmployee:(id,d)     => req('PUT',  `/employees/${id}`, d),

  listBranches:  ()         => req('GET',  '/branches'),
  createBranch:  (d)        => req('POST', '/branches', d),
  updateBranch:  (id,d)     => req('PUT',  `/branches/${id}`, d),

  listAccountTypes:()       => req('GET',  '/account-types'),
  createAccountType:(d)     => req('POST', '/account-types', d),

  getSuspiciousActivities:(p={}) => req('GET',  `/audit/suspicious-activities${qs(p)}`),
  markReviewed:  (id, reviewed=true) => req('PATCH', `/audit/suspicious-activities/${id}`, { reviewed }),
  getAuditLogs:  (p={})          => req('GET',  `/audit/logs${qs(p)}`),
  getAuditLogSummary:(p={})      => req('GET',  `/audit/logs-summary${qs(p)}`),
};
