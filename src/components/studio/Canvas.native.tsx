import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Canvas as SkiaCanvas, FilterMode, Group, Image as SkiaImage, ImageShader, Rect, Shader, rect } from '@shopify/react-native-skia';
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { makeMutable, useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';
import { LOOK_EFFECT } from '@/lib/gl/compositor.native';
import { scheduleOnRN } from 'react-native-worklets';
import { ChevronsLeftRight } from '@/components/icons';
import { rt } from '@/lib/editor/runtime.native';
import { debug } from '@/lib/debug';
import { useEditor } from '@/lib/editor';
import { F } from '@/theme';

const comp = rt.comp!;
const viewer = rt.viewer!;
const splitStart = makeMutable(0.5);

/** What the compositor currently shows; changes only when the look or the images change. */
const subscribeComp = (fn: () => void) => comp.subscribe(fn);
const compSnapshot = () => comp.live;

/**
 * The photo on native: a Skia view that draws the compositor's output with the before/after
 * split, and gestures for pan, pinch-zoom and double-tap.
 * Transforms and the split run on the UI thread from shared values.
 */
export function Canvas({ insetBottom }: { insetBottom: number }) {
  const live = useSyncExternalStore(subscribeComp, compSnapshot);
  const hasPhoto = useEditor((s) => s.work !== null);
  const preview = useEditor((s) => s.preview);
  const compare = useEditor((s) => s.compare);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      debug('stage layout', e.nativeEvent.layout);
      viewer.setStage(e.nativeEvent.layout.width, e.nativeEvent.layout.height, insetBottom);
    },
    [insetBottom],
  );
  useEffect(() => {
    if (hasPhoto) viewer.fit(true);
  }, [hasPhoto]);

  // Worklets copy what they capture to the UI thread: capture the shared values and the zoom
  // callback, never the viewer object itself.
  const { baseS, baseX, baseY, zoom, panX, panY, cx, cy, imgW, imgH, splitX, stageW, holding, compare: comparing, report } = viewer;

  // ── Gestures ───────────────────────────────────────────────────────────────────────────
  const pan = usePanGesture({
    enabled: hasPhoto,
    onUpdate: (e) => {
      'worklet';
      // The photo's centre may leave the middle of the stage, but never the photo itself.
      const limX = (imgW.value * baseS.value * zoom.value) / 2;
      const limY = (imgH.value * baseS.value * zoom.value) / 2;
      panX.value = Math.min(limX, Math.max(-limX, panX.value + e.changeX));
      panY.value = Math.min(limY, Math.max(-limY, panY.value + e.changeY));
    },
  });
  const pinch = usePinchGesture({
    enabled: hasPhoto,
    onUpdate: (e) => {
      'worklet';
      const z = zoom.value;
      const next = Math.min(16, Math.max(1, z * e.scaleChange));
      // Keep the point between the fingers where it is.
      panX.value = e.focalX - cx.value - (next * (e.focalX - cx.value - panX.value)) / z;
      panY.value = e.focalY - cy.value - (next * (e.focalY - cy.value - panY.value)) / z;
      zoom.value = next;
    },
    onDeactivate: () => {
      'worklet';
      scheduleOnRN(report, zoom.value);
    },
  });
  const doubleTap = useTapGesture({
    enabled: hasPhoto,
    numberOfTaps: 2,
    runOnJS: true,
    onActivate: (e) => viewer.toggleZoomAt(e.x, e.y),
  });
  const gestures = useSimultaneousGestures(pinch, pan, doubleTap);

  const splitPan = usePanGesture({
    onBegin: () => {
      'worklet';
      splitStart.value = splitX.value;
    },
    onUpdate: (e) => {
      'worklet';
      splitX.value = Math.min(1, Math.max(0, splitStart.value + e.translationX / stageW.value));
    },
  });

  // ── UI-thread derived drawing state ─────────────────────────────────────────────────────
  const transform = useDerivedValue(() => {
    const z = zoom.value;
    return [
      { translateX: cx.value + panX.value + z * (baseX.value - cx.value) },
      { translateY: cy.value + panY.value + z * (baseY.value - cy.value) },
      { scale: baseS.value * z },
    ];
  });
  const clip = useDerivedValue(() => {
    let uv = 0;
    if (holding.value) uv = 1.01;
    else if (comparing.value && imgW.value) {
      const z = zoom.value;
      const tx = cx.value + panX.value + z * (baseX.value - cx.value);
      uv = Math.min(1.01, Math.max(-0.01, (splitX.value * stageW.value - tx) / (imgW.value * baseS.value * z)));
    }
    return rect(0, 0, Math.max(0, uv) * imgW.value, imgH.value);
  });
  const handleStyle = useAnimatedStyle(() => ({
    opacity: holding.value ? 0 : 1,
    transform: [{ translateX: splitX.value * stageW.value }],
  }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: holding.value ? 0 : 1 }));

  const orig = comp.original;
  const { lookSV } = comp;
  // Everything the shader needs that depends on the images; the look itself arrives live from `lookSV`.
  const fixed = live && { w: live.w, h: live.h, fs: live.fineS, ms: live.midS, ls: live.localS, bs: live.bgS, mw: live.maskW, mh: live.maskH, hm: live.hasMask ? 1 : 0 };
  const uniforms = useDerivedValue(() => {
    const l = lookSV.value;
    const f = fixed;
    return {
      uSize: [f?.w ?? 1, f?.h ?? 1],
      uFineS: f?.fs ?? 1,
      uMidS: f?.ms ?? 1,
      uLocalS: f?.ls ?? 1,
      uBgS: f?.bs ?? 1,
      uMaskSize: [f?.mw ?? 1, f?.mh ?? 1],
      uHasMask: f?.hm ?? 0,
      uExposure: l.exposure,
      uContrast: l.contrast,
      uHighlights: l.highlights,
      uShadows: l.shadows,
      uFade: l.fade,
      uWarm: l.warmth,
      uTint: l.tint,
      uVibrance: l.vibrance,
      uSat: l.saturation,
      uSharpen: l.sharpen,
      uDetail: l.detail,
      uDenoise: l.denoise,
      uVig: l.vignette,
      uGrain: l.grain,
      uBg: l.bg === 'none' ? 0 : l.bg === 'blur' ? 1 : l.bg === 'color' ? 2 : l.bg === 'mono' ? 3 : 4,
      uBgColor: [l.bgColor[0], l.bgColor[1], l.bgColor[2]],
    };
  }, [fixed?.w, fixed?.h, fixed?.fs, fixed?.ms, fixed?.ls, fixed?.bs, fixed?.mw, fixed?.mh, fixed?.hm]);
  const sampling = { filter: FilterMode.Linear };
  const w = preview?.width ?? 0;
  const h = preview?.height ?? 0;

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <GestureDetector gesture={gestures}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          {hasPhoto && live && (
            <SkiaCanvas style={StyleSheet.absoluteFill}>
              <Group transform={transform}>
                <Rect x={0} y={0} width={live.w} height={live.h}>
                  <Shader source={LOOK_EFFECT} uniforms={uniforms}>
                    <ImageShader image={live.img} fit="none" tx="clamp" ty="clamp" sampling={sampling} />
                    <ImageShader image={live.fine} fit="none" tx="clamp" ty="clamp" sampling={sampling} />
                    <ImageShader image={live.mid} fit="none" tx="clamp" ty="clamp" sampling={sampling} />
                    <ImageShader image={live.local} fit="none" tx="clamp" ty="clamp" sampling={sampling} />
                    <ImageShader image={live.bg} fit="none" tx="clamp" ty="clamp" sampling={sampling} />
                    <ImageShader image={live.mask} fit="none" tx="clamp" ty="clamp" sampling={sampling} />
                  </Shader>
                </Rect>
                {orig && (
                  <Group clip={clip}>
                    <SkiaImage image={orig} x={0} y={0} width={w} height={h} fit="fill" />
                  </Group>
                )}
              </Group>
            </SkiaCanvas>
          )}
        </View>
      </GestureDetector>

      {hasPhoto && compare && (
        <>
          <Animated.View style={[styles.split, { bottom: insetBottom }, handleStyle]} pointerEvents="box-none">
            <View style={styles.splitLine} pointerEvents="none" />
            <GestureDetector gesture={splitPan}>
              <View style={styles.splitHit} collapsable={false}>
                <View style={styles.splitKnob}>
                  <ChevronsLeftRight size={18} color="#17140d" />
                </View>
              </View>
            </GestureDetector>
          </Animated.View>
          <Animated.Text style={[styles.tag, { left: 12 }, tagStyle]} pointerEvents="none">
            Before
          </Animated.Text>
          <Animated.Text style={[styles.tag, { right: 12 }, tagStyle]} pointerEvents="none">
            After
          </Animated.Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  split: { position: 'absolute', top: 0, left: 0, width: 0, zIndex: 2 },
  splitLine: { position: 'absolute', top: 0, bottom: 0, left: -1, width: 2, borderRadius: 2, backgroundColor: '#fff' },
  splitHit: { position: 'absolute', top: 0, bottom: 0, left: -24, width: 48, alignItems: 'center', justifyContent: 'center' },
  splitKnob: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  tag: {
    position: 'absolute',
    top: 12,
    zIndex: 3,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,12,13,0.62)',
    color: '#fff',
    fontSize: 12,
    fontFamily: F.uiSemi,
  },
});
