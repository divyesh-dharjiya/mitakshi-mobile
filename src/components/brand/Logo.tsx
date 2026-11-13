import { Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { BRAND } from '@/lib/brand';
import { F, makeStyles } from '@/theme';

/** Tile colours (the app icon) and the iris. */
export const LOGO = { a: '#2563d6', b: '#0a2358', sky: '#5cc4ff' };

/** A solid M. Same geometry as tools/make-assets.mjs (the app icon) and the web app's logo. */
export const M_PATH = 'M100 400V150Q100 116 132 130L256 232L380 130Q412 116 412 150V400H340V268L256 338L172 268V400Z';

/**
 * The Mitakshi mark: an M with an eye above its notch ("Mitakshi" means "of the beautiful eyes"). `tile` draws
 * it white on the navy rounded square (the app icon); without it the M is blue-to-navy on
 * whatever is behind. `id` keeps gradient ids unique when two marks are on screen.
 */
export function LogoMark({ size = 36, id = 'm', tile = true }: { size?: number; id?: string; tile?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Defs>
        <LinearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={LOGO.a} />
          <Stop offset="1" stopColor={LOGO.b} />
        </LinearGradient>
        <LinearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <Stop offset="0.7" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#dbe9ff" />
        </LinearGradient>
        <ClipPath id={`${id}c`}>
          <Rect width="512" height="512" rx="116" />
        </ClipPath>
      </Defs>
      {tile && (
        <G clipPath={`url(#${id}c)`}>
          <Rect width="512" height="512" fill={`url(#${id}s)`} />
          <Rect width="512" height="512" fill={`url(#${id}h)`} />
        </G>
      )}
      <G transform={tile ? 'translate(46 52) scale(0.82)' : 'translate(0 6)'}>
        <Path d={M_PATH} fill={tile ? `url(#${id}m)` : `url(#${id}s)`} />
        <Circle cx="256" cy="136" r="34" fill={tile ? '#fff' : `url(#${id}s)`} />
        <Circle cx="256" cy="136" r="16" fill={tile ? LOGO.sky : '#fff'} />
        <Circle cx="263" cy="129" r="5.5" fill={tile ? '#fff' : LOGO.sky} />
      </G>
    </Svg>
  );
}

/** Mark and wordmark side by side. */
export function Logo({ size = 36 }: { size?: number }) {
  const styles = useStyles();
  return (
    <View style={styles.logo}>
      <LogoMark size={size} />
      <Text style={[styles.word, { fontSize: size * 0.6 }]}>{BRAND.name}</Text>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { color: C.text, fontFamily: F.headBold, letterSpacing: -0.5 },
}));
