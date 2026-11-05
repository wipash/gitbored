import { useLayoutEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  persistenceAvailable: boolean;
}

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readTheme(): ThemeState {
  try {
    const stored = localStorage.getItem('gitbored.theme');
    return { preference: isThemePreference(stored) ? stored : 'system', persistenceAvailable: true };
  } catch {
    return { preference: 'system', persistenceAvailable: false };
  }
}

export function useTheme(): ThemeState & { resolved: 'light' | 'dark'; selectTheme: (preference: ThemePreference) => void } {
  const [theme, setTheme] = useState(readTheme);
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function applyTheme(): void {
      const value = theme.preference === 'system' ? media.matches ? 'dark' : 'light' : theme.preference;
      document.documentElement.dataset['theme'] = value;
      setResolved(value);
    }
    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [theme.preference]);

  function selectTheme(preference: ThemePreference): void {
    try {
      localStorage.setItem('gitbored.theme', preference);
      setTheme({ preference, persistenceAvailable: true });
    } catch {
      setTheme({ preference, persistenceAvailable: false });
    }
  }

  return { ...theme, resolved, selectTheme };
}
