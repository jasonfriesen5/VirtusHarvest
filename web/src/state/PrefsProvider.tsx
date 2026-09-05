import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { setFormatLocale } from '../lib/format';
import { translate } from '../lib/i18n';
import type { Lang } from '../lib/i18n';
import type { WeightUnit } from '../lib/format';

/**
 * Viewer preferences that cut across every page: the unit totals are shown in,
 * which cycle is in scope, how long a window the per-day figures average over,
 * and light/dark. Persisted so a reload doesn't reset them.
 *
 * The window matters more here than in Harvest: intake, cost per head and
 * runway are all "per day fed" averages, and 7 days is the span a feedlot
 * actually talks in.
 */

type Theme = 'light' | 'dark';
export const WINDOWS = [7, 14, 30, 90] as const;
export type WindowDays = (typeof WINDOWS)[number];

interface PrefsValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a Spanish source string, with optional {placeholders}. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  unit: WeightUnit;
  setUnit: (u: WeightUnit) => void;
  /** '' means "all cycles". */
  cycleId: string;
  setCycleId: (id: string) => void;
  windowDays: WindowDays;
  setWindowDays: (d: WindowDays) => void;
  theme: Theme;
  toggleTheme: () => void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

const KEY_LANG = 'vfw_lang';
const KEY_UNIT = 'vfw_unit';
const KEY_CYCLE = 'vfw_cycle';
const KEY_WINDOW = 'vfw_window';
const KEY_THEME = 'vfw_theme';

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = localStorage.getItem(key);
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  // Spanish by default, outright — the same call the app makes. The yard runs
  // in Spanish; English is for whoever is reading the reports.
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = readStored(KEY_LANG, ['es', 'en'] as const, 'es');
    setFormatLocale(stored);
    return stored;
  });
  const [unit, setUnitState] = useState<WeightUnit>(() =>
    readStored(KEY_UNIT, ['kg', 't', 'lb'] as const, 'kg'),
  );
  const [cycleId, setCycleIdState] = useState<string>(() => localStorage.getItem(KEY_CYCLE) ?? '');
  const [windowDays, setWindowDaysState] = useState<WindowDays>(() => {
    const raw = Number(localStorage.getItem(KEY_WINDOW));
    return (WINDOWS as readonly number[]).includes(raw) ? (raw as WindowDays) : 7;
  });
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(KEY_THEME);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(KEY_THEME, theme);
  }, [theme]);

  // Dates, numbers and currency follow the language too — an English page
  // printing "27 ago 2026" is worse than not translating at all.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<PrefsValue>(
    () => ({
      lang,
      setLang: (l) => {
        // Synchronously, so numbers and dates change in the same paint as the
        // words around them.
        setFormatLocale(l);
        setLangState(l);
        localStorage.setItem(KEY_LANG, l);
      },
      t: (key, vars) => translate(lang, key, vars),
      unit,
      setUnit: (u) => {
        setUnitState(u);
        localStorage.setItem(KEY_UNIT, u);
      },
      cycleId,
      setCycleId: (id) => {
        setCycleIdState(id);
        localStorage.setItem(KEY_CYCLE, id);
      },
      windowDays,
      setWindowDays: (d) => {
        setWindowDaysState(d);
        localStorage.setItem(KEY_WINDOW, String(d));
      },
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [lang, unit, cycleId, windowDays, theme],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

/** Just the translator, for the many components that need nothing else. */
export function useT(): PrefsValue['t'] {
  return usePrefs().t;
}

export function usePrefs(): PrefsValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return ctx;
}
