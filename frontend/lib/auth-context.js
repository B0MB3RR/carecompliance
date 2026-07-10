'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('cc_user') : null;
    if (stored) setUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  function persistUser(userObj) {
    localStorage.setItem('cc_user', JSON.stringify(userObj));
    setUser(userObj);
  }

  /**
   * Logs in with email + password, plus a company registration ID for
   * tenant accounts. Platform staff (super_admin) leave registrationId
   * blank, since their accounts aren't tied to any company.
   *
   * If the account still has an admin-issued temporary password,
   * mustChangePassword comes back true and we route to /set-password
   * instead of the dashboard - the user object carries that flag too, so
   * a page refresh mid-flow still enforces it rather than letting them
   * navigate around with a password they were told to change.
   */
  async function login(email, password, registrationId) {
    const data = await api.post('/auth/login', { email, password, registrationId: registrationId || undefined });
    api.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    const userObj = { ...data.user, mustChangePassword: data.mustChangePassword };
    persistUser(userObj);
    router.push(data.mustChangePassword ? '/set-password' : '/dashboard');
  }

  async function completePasswordChange(newPassword) {
    await api.post('/auth/set-password', { newPassword });
    if (user) persistUser({ ...user, mustChangePassword: false });
    router.push('/dashboard');
  }

  async function logout() {
    const { refreshToken } = api.getTokens();
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // Ignore - proceed with local logout regardless.
    }
    api.clearTokens();
    setUser(null);
    router.push('/login');
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, completePasswordChange, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
