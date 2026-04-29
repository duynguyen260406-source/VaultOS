const UK = 'vaultos_user';
const USER_TTL_MS = 8 * 60 * 60 * 1000;

function readStoredUser(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.expires_at && Date.now() > parsed.expires_at) {
      clearAuth();
      return null;
    }
    return parsed?.user || parsed;
  } catch {
    return null;
  }
}

function persistUser(user) {
  const payload = JSON.stringify({ user, expires_at: Date.now() + USER_TTL_MS });
  sessionStorage.setItem(UK, payload);
  localStorage.setItem(UK, payload);
}

export function getUser() {
  const user = readStoredUser(sessionStorage.getItem(UK)) || readStoredUser(localStorage.getItem(UK));
  if (user) persistUser(user);
  return user;
}

export function setAuth(_token, user) {
  persistUser(user);
}

export function clearAuth() {
  localStorage.removeItem(UK);
  sessionStorage.removeItem(UK);
}

export const isRole = (...roles) => { const u = getUser(); return u && roles.includes(u.role); };


