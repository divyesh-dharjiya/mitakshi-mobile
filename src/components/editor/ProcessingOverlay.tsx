import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { useEditor } from '@/lib/editor';
import { F, makeStyles, useTheme } from '@/theme';

const SIZE = 112;
const RADIUS = 48;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const native = Platform.OS !== 'web';

/**
 * Shown while a long job runs (opening, AI, downloads, saving): the screen dims, a large ring
 * shows the progress with the percentage inside, and the step and Cancel sit underneath.
 */
export function ProcessingOverlay() {
  const C = useTheme();
  const styles = useStyles();
  const busy = useEditor((s) => s.busy);
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  // No real progress (a step starting or finishing reports 0 or 1): spin a short arc instead of a percentage.
  const known = !!busy && busy.progress > 0.001 && busy.progress < 0.999;
  const active = !!busy;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: native }));
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      ]),
    );
    loop.start();
    glow.start();
    return () => {
      loop.stop();
      glow.stop();
      spin.setValue(0);
      pulse.setValue(0);
    };
  }, [active, spin, pulse]);

  if (!busy) return null;
  const p = known ? Math.min(1, busy.progress) : 0.22;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '270deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const cancel = busy.cancel;

  return (
    <View style={styles.root} accessibilityViewIsModal accessibilityLiveRegion="polite">
      <View style={styles.card}>
        <View style={styles.ringWrap}>
          <Animated.View style={[styles.glow, { opacity, transform: [{ scale }] }]} />
          <Animated.View style={{ transform: [{ rotate: known ? '-90deg' : rotate }] }}>
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <Defs>
                <SvgGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={C.grad.colors[0]} />
                  <Stop offset="0.55" stopColor={C.grad.colors[1]} />
                  <Stop offset="1" stopColor={C.grad.colors[2]} />
                </SvgGradient>
              </Defs>
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={7} stroke={C.fill3} />
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={7}
                strokeLinecap="round"
                stroke="url(#ring)"
                strokeDasharray={`${CIRCUMFERENCE}`}
                strokeDashoffset={CIRCUMFERENCE * (1 - p)}
              />
            </Svg>
          </Animated.View>
          {known && <Text style={styles.pct}>{Math.round(p * 100)}%</Text>}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {busy.title}
        </Text>
        {/* The percentage is already in the ring, so the line under the title only shows other details. */}
        {!!busy.sub && !/^\d+%$/.test(busy.sub) && (
          <Text style={styles.sub} numberOfLines={3}>
            {busy.sub}
          </Text>
        )}
        {cancel && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              cancel();
              useEditor.setState((s) => (s.busy ? { busy: { ...s.busy, sub: 'Cancelling…', cancel: undefined } } : {}));
            }}
            style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: C.scrim },
  card: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    gap: 8,
    paddingTop: 26,
    paddingBottom: 20,
    paddingHorizontal: 22,
    borderRadius: 28,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  ringWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  glow: { position: 'absolute', width: SIZE - 18, height: SIZE - 18, borderRadius: SIZE, backgroundColor: C.accentSoft },
  pct: { position: 'absolute', color: C.text, fontSize: 24, fontFamily: F.uiBold, fontVariant: ['tabular-nums'] },
  title: { color: C.text, fontSize: 17, fontFamily: F.uiSemi, textAlign: 'center' },
  sub: { color: C.text3, fontSize: 13, lineHeight: 18, fontFamily: F.ui, textAlign: 'center', fontVariant: ['tabular-nums'] },
  cancel: { marginTop: 10, paddingHorizontal: 26, height: 40, borderRadius: 20, justifyContent: 'center', backgroundColor: C.fill2, borderWidth: 1, borderColor: C.line2 },
  cancelText: { color: C.text, fontSize: 14, fontFamily: F.uiSemi },
}));
