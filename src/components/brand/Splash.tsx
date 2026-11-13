import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LogoMark } from '@/components/brand/Logo';
import { BRAND } from '@/lib/brand';
import { DARK as C, F } from '@/theme';

const MARK = 112;

/**
 * The opening screen, always in the dark brand colours (the same background as Android's own splash, so nothing flashes in between): the
 * logo settles in with a soft glow, the name rises under it, then it all fades into the app. It leaves as
 * soon as the app is ready, after about a second (`ready` is false while fonts load).
 */
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const mark = useSharedValue(0);
  const word = useSharedValue(0);
  const out = useSharedValue(1);

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    mark.value = withTiming(1, { duration: 650, easing: ease });
    word.value = withDelay(280, withTiming(1, { duration: 550, easing: ease }));
  }, [mark, word]);

  useEffect(() => {
    if (!ready) return;
    out.value = withDelay(
      1050,
      withTiming(0, { duration: 320 }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(onDone);
      }),
    );
  }, [ready, out, onDone]);

  const logo = useAnimatedStyle(() => ({ opacity: mark.value, transform: [{ scale: 0.82 + mark.value * 0.18 }] }));
  const halo = useAnimatedStyle(() => ({ opacity: mark.value, transform: [{ scale: 0.8 + mark.value * 0.2 }] }));
  const text = useAnimatedStyle(() => ({ opacity: word.value, transform: [{ translateY: (1 - word.value) * 12 }] }));
  const root = useAnimatedStyle(() => ({ opacity: out.value }));

  return (
    <Animated.View style={[styles.root, root]} pointerEvents={ready ? 'none' : 'auto'}>
      <Animated.View style={[styles.halo, halo]}>
        <Svg width={420} height={420}>
          <Defs>
            <RadialGradient id="halo" cx="210" cy="210" r="210" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={C.accent} stopOpacity="0.28" />
              <Stop offset="1" stopColor={C.accent} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={420} height={420} fill="url(#halo)" />
        </Svg>
      </Animated.View>
      <Animated.View style={logo}>
        <LogoMark size={MARK} id="splash" />
      </Animated.View>
      <Animated.View style={[styles.words, text]}>
        <Text style={styles.name}>{BRAND.name}</Text>
        <Text style={styles.tag}>{BRAND.tagline}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  halo: { position: 'absolute', width: 420, height: 420 },
  words: { alignItems: 'center', marginTop: 24, gap: 6 },
  name: { color: C.text, fontSize: 32, fontFamily: F.headBold, letterSpacing: -1 },
  tag: { color: C.text3, fontSize: 14, fontFamily: F.uiMedium, letterSpacing: 0.4 },
});
