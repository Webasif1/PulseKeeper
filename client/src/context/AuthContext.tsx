import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import * as authService from '@/services/auth.service';
import { SESSION_EXPIRED_EVENT } from '@/services/api';

import type { User } from '@/types/api';

interface AuthContextValue {
  user: User | null;
  /** True until the initial session check finishes. */
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Authentication state.
 *
 * The token lives in an HTTP-only cookie the browser sends automatically, so
 * this holds only the user object — there is deliberately no token in
 * JavaScript, which is what stops an XSS bug from exfiltrating a session.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On load the cookie may or may not still be valid; ask the server rather
  // than assuming either way.
  useEffect(() => {
    let cancelled = false;

    authService
      .fetchCurrentUser()
      .then(({ user: currentUser }) => {
        if (!cancelled) setUser(currentUser);
      })
      .catch(() => {
        // 401 here is the ordinary "not signed in" answer, not an error worth
        // showing anyone.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The API layer cannot import this context without a cycle, so it announces
  // an expired session through an event instead.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: signedIn } = await authService.login({ email, password });
    setUser(signedIn);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { user: created } = await authService.register({ name, email, password });
    setUser(created);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      // Clear locally even if the request failed: the user asked to sign out,
      // and leaving them apparently signed in would be worse than a stale
      // cookie the server will reject anyway.
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
    }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
