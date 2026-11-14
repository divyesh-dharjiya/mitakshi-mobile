import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, Image, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { ChevronsLeftRight } from '@/components/icons';
import { F, makeStyles, useTheme } from '@/theme';

/* eslint-disable @typescript-eslint/no-require-imports */
const SOFT = require('../../../assets/demo-soft.jpg');
const SHARP = require('../../../assets/demo-sharp.jpg');
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * The home screen's proof of what the app does: one scene, soft on the left and crisp on the right,
 * with the divider sweeping back and forth until the user grabs it.
 */
export function BeforeAfter({ fill }: { fill?: boolean }) {
  const C = useTheme();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const pos = useSharedValue(0.5);
  const start = useSharedValue(0.5);

  const sweep = () => {
    pos.value = withRepeat(
      withSequence(withTiming(0.88, { duration: 2600, easing: Easing.inOut(Easing.cubic) }), withTiming(0.12, { duration: 2600, easing: Easing.inOut(Easing.cubic) })),
      -1,
      true,
    );
  };
  useEffect(() => {
    if (width) sweep();
    return () => cancelAnimation(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      cancelAnimation(pos);
      start.value = pos.value;
    },
    onUpdate: (e) => {
      'worklet';
      pos.value = Math.min(0.97, Math.max(0.03, start.value + e.translationX / Math.max(1, width)));
    },
    onFinalize: () => {
      'worklet';
      pos.value = withDelay(2500, withRepeat(withSequence(withTiming(0.88, { duration: 2600 }), withTiming(0.12, { duration: 2600 })), -1, true));
    },
  });

  const reveal = useAnimatedStyle(() => ({ width: pos.value * width }));
  const handle = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * width - 22 }] }));
  const beforeTag = useAnimatedStyle(() => ({ opacity: pos.value > 0.2 ? 1 : 0 }));
  const afterTag = useAnimatedStyle(() => ({ opacity: pos.value < 0.8 ? 1 : 0 }));

  return (
    <View style={fill ? styles.fill : styles.root} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="Before and after example" accessible>
      {/* Before underneath, the crisp After revealed from the left by the divider. */}
      <Image source={SOFT} style={styles.img} resizeMode="cover" fadeDuration={0} />
      <Animated.View style={[styles.reveal, reveal]}>
        <Image source={SHARP} style={[styles.img, { width }]} resizeMode="cover" fadeDuration={0} />
      </Animated.View>
      <Animated.View style={[styles.tag, { right: 12 }, beforeTag]} pointerEvents="none">
        <Text style={styles.tagText}>Before</Text>
      </Animated.View>
      <Animated.View style={[styles.tag, styles.tagAfter, { left: 12 }, afterTag]} pointerEvents="none">
        <Text style={[styles.tagText, { color: C.onAccent }]}>After · HD</Text>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.handle, handle]}>
          <View style={styles.line} />
          <View style={styles.knob}>
            <ChevronsLeftRight size={18} color={C.onAccent} />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  root: { width: '100%', aspectRatio: 3 / 2, borderRadius: 26, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2 },
  // Separate from root (not an override of it): react-native-web keeps root's aspectRatio when it is overridden with undefined.
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: C.surface },
  img: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  reveal: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  handle: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },
  knob: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  tag: { position: 'absolute', top: 12, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(10,10,11,0.62)' },
  tagAfter: { backgroundColor: C.accent },
  tagText: { color: '#fff', fontSize: 11.5, fontFamily: F.uiBold, letterSpacing: 0.2 },
}));
