import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ThemePreference } from '@/types/api';

const STORAGE_KEY = 'pulsekeeper-theme';

interface ThemeContextValue {
  /** What the user chose: light, dark, or follow the system. */
  theme: ThemePreference;
  /** What is actually rendered right now. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemePreference) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private browsing can make localStorage throw; fall through to the default.
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Theme provider (SPEC §30).
 *
 * The initial class is applied by an inline script in index.html, before React
 * mounts — doing it here would render the default palette for one frame and
 * flash the wrong colours. This provider owns every change after that.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredTheme);
  const [systemIsDark, setSystemIsDark] = useState(systemPrefersDark);

  // "System" is a live preference, not a one-time reading: a user switching
  // their OS to dark at sunset should see this follow.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference is lost on reload, but the session still works.
    }
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
