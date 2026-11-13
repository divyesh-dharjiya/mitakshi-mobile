/**
 * Design tokens: one navy-and-sky identity in two modes. Dark is the default (deep navy screens, sky-blue
 * accent, the photo on a near-black stage); light swaps in cool off-white screens and a blue-to-navy accent.
 * Every colour in the app comes from here. Components read the active palette with `useTheme()` and build
 * their styles with `makeStyles()`, so switching the mode restyles everything at once.
 */
import { type ImageStyle, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { create } from 'zustand';
import { loadMode, saveMode } from '@/lib/modeStorage';

export type Mode = 'dark' | 'light';

/** `#rrggbb` + alpha → rgba() (React Native has no color-mix). */
export function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export interface Palette {
  mode: Mode;
  bg: string;
  surface: string;
  surface2: string;
  glass: string;
  glassBorder: string;
  fill1: string;
  fill2: string;
  fill3: string;
  raised: string;
  line: string;
  line2: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accent2: string;
  accent3: string;
  accentSoft: string;
  accentLine: string;
  /** A second, softer blue-violet used for glows and gradient edges. */
  accentAlt: string;
  /** The two soft light pools behind the home screen. */
  glow1: string;
  glow2: string;
  /** Text and icons on top of the accent gradient. */
  onAccent: string;
  /** The photo stage in the editor. */
  stage: string;
  /** Floating controls over a photo. */
  float: string;
  ok: string;
  warn: string;
  danger: string;
  scrim: string;
  /** Props for expo-linear-gradient: primary buttons and progress. */
  grad: { colors: readonly [string, string, string]; locations: readonly [number, number, number]; start: { x: number; y: number }; end: { x: number; y: number } };
}

const GRAD_GEOMETRY = { locations: [0, 0.5, 1] as const, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };

export const DARK: Palette = {
  mode: 'dark',
  bg: '#0a1020',
  surface: '#111a33',
  surface2: '#16213f',
  glass: 'rgba(17, 26, 51, 0.94)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  fill1: 'rgba(255, 255, 255, 0.04)',
  fill2: 'rgba(255, 255, 255, 0.07)',
  fill3: 'rgba(255, 255, 255, 0.13)',
  raised: '#1c2a4d',
  line: 'rgba(255, 255, 255, 0.08)',
  line2: 'rgba(255, 255, 255, 0.14)',
  text: '#f1f5ff',
  text2: '#a9b6d6',
  text3: '#7384a8',
  accent: '#4cb8ff',
  accent2: '#86d6ff',
  accent3: '#2b86f5',
  accentSoft: alpha('#4cb8ff', 0.14),
  accentLine: alpha('#4cb8ff', 0.5),
  accentAlt: '#7c8cff',
  glow1: alpha('#4cb8ff', 0.1),
  glow2: alpha('#6366f1', 0.09),
  onAccent: '#06142e',
  stage: '#060b18',
  float: 'rgba(10, 16, 34, 0.82)',
  ok: '#34d399',
  warn: '#fbbf24',
  danger: '#fb7185',
  scrim: 'rgba(2, 6, 18, 0.62)',
  grad: { colors: ['#86d6ff', '#4cb8ff', '#2b86f5'], ...GRAD_GEOMETRY },
};

export const LIGHT: Palette = {
  mode: 'light',
  bg: '#f2f6fc',
  surface: '#ffffff',
  surface2: '#e8f0fa',
  glass: 'rgba(255, 255, 255, 0.94)',
  glassBorder: 'rgba(10, 30, 80, 0.1)',
  fill1: 'rgba(10, 40, 110, 0.04)',
  fill2: 'rgba(10, 40, 110, 0.07)',
  fill3: 'rgba(10, 40, 110, 0.13)',
  raised: '#ffffff',
  line: 'rgba(10, 40, 110, 0.09)',
  line2: 'rgba(10, 40, 110, 0.14)',
  text: '#0a1a3f',
  text2: '#3f5078',
  text3: '#74839f',
  accent: '#1f6fe0',
  accent2: '#4cb8ff',
  accent3: '#0a2c73',
  accentSoft: alpha('#1f6fe0', 0.12),
  accentLine: alpha('#1f6fe0', 0.45),
  accentAlt: '#5b6ef0',
  glow1: alpha('#4cb8ff', 0.12),
  glow2: alpha('#6366f1', 0.05),
  onAccent: '#ffffff',
  stage: '#e1eaf6',
  float: 'rgba(10, 26, 63, 0.8)',
  ok: '#12a679',
  warn: '#d98a00',
  danger: '#e5484d',
  scrim: 'rgba(10, 26, 63, 0.5)',
  grad: { colors: ['#2f8cf0', '#1f6fe0', '#0a2c73'], ...GRAD_GEOMETRY },
};

const PALETTES: Record<Mode, Palette> = { dark: DARK, light: LIGHT };

/** The chosen mode (remembered between launches). Dark unless the user switched. */
export const useThemeMode = create<{ mode: Mode }>(() => ({ mode: loadMode() ?? 'dark' }));

export function setMode(mode: Mode) {
  if (useThemeMode.getState().mode === mode) return;
  useThemeMode.setState({ mode });
  saveMode(mode);
}

export const toggleMode = () => setMode(useThemeMode.getState().mode === 'dark' ? 'light' : 'dark');

/** The active palette; the component re-renders when the mode changes. */
export function useTheme(): Palette {
  return PALETTES[useThemeMode((s) => s.mode)];
}

/** The active palette outside React (for code that is not a component). */
export const getPalette = (): Palette => PALETTES[useThemeMode.getState().mode];

type Style = ViewStyle | TextStyle | ImageStyle;

/**
 * Styles that depend on the palette: `const useStyles = makeStyles((C) => ({ box: { backgroundColor: C.surface } }))`,
 * then `const styles = useStyles()` inside the component. One StyleSheet is built per mode and reused.
 */
export function makeStyles<T extends Record<string, Style>>(factory: (C: Palette) => T): () => T {
  const cache: Partial<Record<Mode, T>> = {};
  return function useStyles() {
    const mode = useThemeMode((s) => s.mode);
    return (cache[mode] ??= StyleSheet.create(factory(PALETTES[mode])) as unknown as T);
  };
}

/** One family (Inter) in four weights keeps the app small; headings use the heavier weights. */
export const F = {
  ui: 'Inter_400Regular',
  uiMedium: 'Inter_500Medium',
  uiSemi: 'Inter_600SemiBold',
  uiBold: 'Inter_700Bold',
  head: 'Inter_700Bold',
  headMedium: 'Inter_600SemiBold',
  headBold: 'Inter_700Bold',
} as const;

export const R = { xl: 24, lg: 18, md: 14, sm: 10, pill: 999 } as const;

/** Phones and small tablets use the stacked layout below this width. */
export const WIDE = 820;

/** react-native-web adds `hovered` to Pressable's state (mouse pointers only). */
export const isHovered = (state: object) => !!(state as { hovered?: boolean }).hovered;
