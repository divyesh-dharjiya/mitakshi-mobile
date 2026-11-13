import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';

/**
 * Two soft pools of light (sky blue top right, indigo lower left) behind a screen: depth without a single
 * hard edge. Drawn once as SVG radial gradients, never intercepts touches, and follows the light / dark mode.
 */
export function Aurora() {
  const C = useTheme();
  const dark = C.mode === 'dark';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="aur1" cx="0.9" cy="0.02" rx="0.6" ry="0.24" fx="0.9" fy="0.02">
            <Stop offset="0" stopColor={C.accent} stopOpacity={dark ? 0.14 : 0.12} />
            <Stop offset="1" stopColor={C.accent} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="aur2" cx="0.0" cy="0.62" rx="0.65" ry="0.2" fx="0.0" fy="0.62">
            <Stop offset="0" stopColor={C.accentAlt} stopOpacity={dark ? 0.13 : 0.07} />
            <Stop offset="1" stopColor={C.accentAlt} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#aur1)" />
        <Rect width="100%" height="100%" fill="url(#aur2)" />
      </Svg>
    </View>
  );
}
