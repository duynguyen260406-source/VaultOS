import { html } from '../lib/html.js';
import { createContext, useContext, useState, useCallback } from 'react';
import { getUser, setAuth, clearAuth } from '../lib/auth.js';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getUser());

  const login = useCallback(async (username, password) => {
    const data = await api.login({ username, password });
    const u = { user_id: data.user_id, username: data.username, role: data.role, employee_id: data.employee_id, branch_id: data.branch_id };
    setAuth(data.access_token, u);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch {}
    clearAuth();
    setUser(null);
  }, []);

  const refreshUser = useCallback(() => {
    setUser(getUser());
  }, []);

  return html`
    <${AuthContext.Provider} value=${{ user, login, logout, refreshUser }}>
      ${children}
    <//>
  `;
}

export const useAuth = () => useContext(AuthContext);


