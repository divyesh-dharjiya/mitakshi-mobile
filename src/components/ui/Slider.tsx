import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { clamp } from '@/lib/format';
import { F, makeStyles } from '@/theme';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Used for the "changed" indicator and for double-tap reset. */
  defaultValue?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  ends?: [string, string];
  disabled?: boolean;
  /** One compact row: label, track and value side by side (long lists of sliders). */
  inline?: boolean;
}

const THUMB = 26;
const TRACK_H = 44;
const RAIL_H = 6;
const DOUBLE_TAP_MS = 300;
/** At most one update per display frame: the picture is redrawn from these, the thumb is not. */
const EMIT_MS = 16;

/**
 * Labelled range slider. The thumb and the fill follow the finger on the UI thread (they never wait for
 * JavaScript, so they stay smooth however busy the app is); the value reaches the app at most once per
 * frame. Double-tap resets to the default.
 */
export const Slider = memo(function Slider({ label, value, min, max, step = 0.01, defaultValue, onChange, format, ends, disabled, inline }: SliderProps) {
  const styles = useStyles();
  const norm = (v: number) => (clamp(v, min, max) - min) / (max - min);
  const zero = min < 0 && max > 0 ? -min / (max - min) : 0; // signed sliders fill from their zero point
  const hasDefault = defaultValue !== undefined;
  const changed = hasDefault && Math.abs(value - defaultValue) > 0.005;

  const [shown, setShown] = useState(value);
  const width = useSharedValue(0);
  const p = useSharedValue(norm(value));
  const dragging = useSharedValue(false);
  const lastEmit = useSharedValue(0);
  const lastValue = useSharedValue(value);
  const lastTap = useSharedValue(0);

  const cb = useRef(onChange);
  cb.current = onChange;
  const emit = useCallback((v: number) => {
    setShown(v);
    cb.current(v);
  }, []);
  const settle = useCallback(() => setShown((s) => s), []);

  // Follow the value when something else changes it (reset, a look, undo), but never while dragging.
  useEffect(() => {
    setShown(value);
    if (!dragging.value) {
      p.value = norm(value);
      lastValue.value = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max]);

  // Declared before the gesture that captures it: a worklet copies what it closes over at creation time.
  /** Thumb position from a touch x, then the value (rounded to `step`) to the app, once per frame. */
  const move = (x: number) => {
    'worklet';
    const usable = Math.max(1, width.value - THUMB);
    const q = Math.min(1, Math.max(0, (x - THUMB / 2) / usable));
    p.value = q;
    const raw = min + q * (max - min);
    const v = Math.min(max, Math.max(min, Math.round(raw / step) * step));
    const now = Date.now();
    if (v !== lastValue.value && (now - lastEmit.value >= EMIT_MS || q === 0 || q === 1)) {
      lastValue.value = v;
      lastEmit.value = now;
      scheduleOnRN(emit, Number(v.toFixed(6)));
    }
  };

  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: 0,
    onBegin: (e) => {
      'worklet';
      dragging.value = true;
      const now = Date.now();
      if (hasDefault && now - lastTap.value < DOUBLE_TAP_MS) {
        lastTap.value = 0;
        p.value = (Math.min(max, Math.max(min, defaultValue!)) - min) / (max - min);
        lastValue.value = defaultValue!;
        scheduleOnRN(emit, defaultValue!);
        return;
      }
      lastTap.value = now;
      move(e.x);
    },
    onUpdate: (e) => {
      'worklet';
      move(e.x);
    },
    onFinalize: () => {
      'worklet';
      dragging.value = false;
      scheduleOnRN(settle);
    },
  });

  // Read the track width directly in each style: Reanimated only re-runs a style when a shared value it reads
  // itself changes, so going through a helper would leave the thumb at the left edge until the first touch.
  const fillStyle = useAnimatedStyle(() => {
    const usable = Math.max(0, width.value - THUMB);
    const a = zero > 0 ? THUMB / 2 + zero * usable : 0;
    const b = THUMB / 2 + p.value * usable;
    return { left: Math.min(a, b), width: Math.abs(b - a) };
  });
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * Math.max(0, width.value - THUMB) }] }));

  const text = format ? format(shown) : String(Math.round(shown * 100));

  const trackEl = (
    <GestureDetector gesture={pan}>
      <View
        style={styles.track}
        collapsable={false}
        onLayout={(e: LayoutChangeEvent) => (width.value = e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const k = (max - min) / 20;
          const v = clamp(value + (e.nativeEvent.actionName === 'increment' ? k : -k), min, max);
          p.value = norm(v);
          emit(v);
        }}
      >
        <View style={styles.rail} pointerEvents="none" />
        <Animated.View style={[styles.fill, fillStyle]} pointerEvents="none" />
        <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />
      </View>
    </GestureDetector>
  );

  if (inline) {
    return (
      <View style={[styles.inline, disabled && styles.disabled]}>
        <View style={styles.inlineLabel}>
          {changed && <View style={styles.dot} />}
          <Text numberOfLines={1} style={styles.label}>
            {label}
          </Text>
        </View>
        <View style={styles.inlineTrack}>{trackEl}</View>
        <Text style={[styles.value, changed && styles.valueOn]}>{text}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      <View style={styles.head}>
        <View style={styles.labelRow}>
          {changed && <View style={styles.dot} />}
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={[styles.value, changed && styles.valueOn]}>{text}</Text>
      </View>
      {trackEl}
      {ends && (
        <View style={styles.ends}>
          <Text style={styles.endText}>{ends[0]}</Text>
          <Text style={styles.endText}>{ends[1]}</Text>
        </View>
      )}
    </View>
  );
});

const useStyles = makeStyles((C) => ({
  wrap: { gap: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inlineLabel: { width: 100, flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineTrack: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.45, pointerEvents: 'none' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent },
  label: { color: C.text2, fontSize: 13, fontFamily: F.uiMedium },
  value: { minWidth: 44, textAlign: 'center', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: C.fill2, color: C.text3, fontSize: 12.5, fontFamily: F.uiSemi, fontVariant: ['tabular-nums'] },
  valueOn: { color: C.accent, backgroundColor: C.accentSoft },
  track: { height: TRACK_H, justifyContent: 'center', cursor: 'pointer' } as never,
  rail: { height: RAIL_H, borderRadius: RAIL_H, backgroundColor: C.fill3 },
  fill: { position: 'absolute', top: (TRACK_H - RAIL_H) / 2, height: RAIL_H, borderRadius: RAIL_H, backgroundColor: C.accent },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (TRACK_H - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: C.accent,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  endText: { color: C.text3, fontSize: 11.5, fontFamily: F.uiMedium },
}));
