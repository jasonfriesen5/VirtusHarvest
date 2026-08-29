import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AreaUnit, DisplayUnit } from '../lib/units';

/**
 * Viewer preferences that cut across every page: which unit totals are shown
 * in, which season is in scope, and light/dark. Persisted to localStorage so
 * a reload doesn't reset them.
 */

type Theme = 'light' | 'dark';

interface PrefsValue {
  unit: DisplayUnit;
  setUnit: (u: DisplayUnit) => void;
  areaUnit: AreaUnit;
  setAreaUnit: (u: AreaUnit) => void;
  /** '' means "all seasons". */
  seasonId: string;
  setSeasonId: (id: string) => void;
  theme: Theme;
  toggleTheme: () => void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

const KEY_UNIT = 'vh_unit';
const KEY_SEASON = 'vh_season';
const KEY_THEME = 'vh_theme';
const KEY_AREA = 'vh_area_unit';

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = localStorage.getItem(key);
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<DisplayUnit>(() =>
    readStored(KEY_UNIT, ['kg', 'lb', 't'] as const, 'kg'),
  );
  const [areaUnit, setAreaUnitState] = useState<AreaUnit>(() =>
    readStored(KEY_AREA, ['ha', 'ac'] as const, 'ha'),
  );
  const [seasonId, setSeasonIdState] = useState<string>(() => localStorage.getItem(KEY_SEASON) ?? '');
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(KEY_THEME);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(KEY_THEME, theme);
  }, [theme]);

  const value = useMemo<PrefsValue>(
    () => ({
      unit,
      setUnit: (u) => {
        setUnitState(u);
        localStorage.setItem(KEY_UNIT, u);
      },
      areaUnit,
      setAreaUnit: (u) => {
        setAreaUnitState(u);
        localStorage.setItem(KEY_AREA, u);
      },
      seasonId,
      setSeasonId: (id) => {
        setSeasonIdState(id);
        localStorage.setItem(KEY_SEASON, id);
      },
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [unit, areaUnit, seasonId, theme],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return ctx;
}
