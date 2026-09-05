import { usePrefs } from '../state/PrefsProvider';

/**
 * Chart colours are picked per mode rather than flipped automatically — a
 * colour tuned for a white surface is the wrong lightness on a dark one. Both
 * sets keep 3:1 against their own surface and stay separable under the common
 * colour-vision deficiencies, which matters most for target-vs-actual, where
 * the whole point is telling two marks apart.
 */
export interface ChartTheme {
  /** Actual — the measured thing, always the brand green. */
  series1: string;
  /** Target / secondary — a blue, so red-green CVD still separates them. */
  series2: string;
  /** Dry matter, and third series generally. */
  series3: string;
  over: string;
  under: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

const LIGHT: ChartTheme = {
  series1: '#20a44c',
  series2: '#2a78d6',
  series3: '#8a5cd6',
  over: '#c2410c',
  under: '#a16207',
  grid: '#e2e8f0',
  axis: '#64748b',
  tooltipBg: '#ffffff',
  tooltipBorder: '#cbd5e1',
  tooltipText: '#0f172a',
};

const DARK: ChartTheme = {
  series1: '#31b85e',
  series2: '#3987e5',
  series3: '#a179e6',
  over: '#f97316',
  under: '#eab308',
  grid: '#1e293b',
  axis: '#94a3b8',
  tooltipBg: '#0f172a',
  tooltipBorder: '#334155',
  tooltipText: '#f1f5f9',
};

export function useChartTheme(): ChartTheme {
  const { theme } = usePrefs();
  return theme === 'dark' ? DARK : LIGHT;
}

/** Shared Recharts tooltip styling, so every chart's hover card matches. */
export function tooltipProps(t: ChartTheme) {
  return {
    contentStyle: {
      background: t.tooltipBg,
      border: `1px solid ${t.tooltipBorder}`,
      borderRadius: 8,
      fontSize: 12,
      color: t.tooltipText,
    },
    labelStyle: { color: t.tooltipText, fontWeight: 600 },
    itemStyle: { color: t.tooltipText },
  };
}
