import { usePrefs } from '../state/PrefsProvider';

/**
 * Chart colours are selected per mode rather than flipped automatically —
 * a colour tuned for a white surface is the wrong lightness on a dark one.
 * Both sets pass the lightness band, chroma floor, CVD separation,
 * normal-vision floor and 3:1 contrast checks against their own surface.
 */
export interface ChartTheme {
  series1: string;
  series2: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

const LIGHT: ChartTheme = {
  series1: '#c47d00',
  series2: '#2a78d6',
  grid: '#e2e8f0',
  axis: '#64748b',
  tooltipBg: '#ffffff',
  tooltipBorder: '#cbd5e1',
  tooltipText: '#0f172a',
};

const DARK: ChartTheme = {
  // A step brighter than the light value: #c47d00 sits in the light band but
  // the dark surface needs OKLCH L ≈ 0.48–0.67 to keep 3:1 contrast.
  series1: '#c98500',
  series2: '#3987e5',
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
