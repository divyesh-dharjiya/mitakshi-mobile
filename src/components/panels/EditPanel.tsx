import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Palette, Sparkles, SunMedium } from '@/components/icons';
import { Segmented } from '@/components/ui/primitives';
import { Slider } from '@/components/ui/Slider';
import { type Look, NEUTRAL, type ToneKey } from '@/lib/gl/look';
import { renderLookThumbs } from '@/lib/gl/compositor';
import { applyFilter, autoValues, FILTERS, resetAdjustments, setLook, TONE, TONE_GROUPS, TONE_ZERO, type ToneDef, type ToneGroup, useEditor } from '@/lib/editor';
import { F, makeStyles, useTheme } from '@/theme';

type Mode = 'looks' | 'adjust';
const MODES = [
  { value: 'looks' as const, label: 'Looks' },
  { value: 'adjust' as const, label: 'Adjust' },
];

const format = (def: ToneDef) => (v: number) => `${v > 0 && def.min < 0 ? '+' : ''}${Math.round(v * 100)}`;

/** The one slider on screen: it follows the chip that is selected, and re-renders alone while dragging. */
function ToneSlider({ def, disabled }: { def: ToneDef; disabled: boolean }) {
  const value = useEditor((s) => s.look[def.key as ToneKey]);
  const onChange = useCallback((v: number) => setLook({ [def.key]: v } as Partial<Look>), [def.key]);
  return <Slider inline label={def.label} min={def.min} max={def.max} defaultValue={0} value={value} disabled={disabled} format={format(def)} onChange={onChange} />;
}

/**
 * Thumbnails of the open photo with every look applied, drawn once per photo (a moment after the panel opens).
 * Until they are ready, or if drawing fails, the strip shows colour swatches.
 */
function useLookThumbs(): Record<string, string> {
  const preview = useEditor((s) => s.preview);
  const [uris, setUris] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!preview) return;
    let dead = false;
    const t = setTimeout(() => {
      try {
        const looks = FILTERS.map((f) => ({ ...NEUTRAL, ...TONE_ZERO, ...(f.values === 'auto' ? autoValues(preview) : f.values) }));
        const out = renderLookThumbs(preview, looks, 128);
        if (!dead && out.length === FILTERS.length) setUris(Object.fromEntries(FILTERS.map((f, i) => [f.id, out[i]])));
      } catch {
        /* the colour swatches stay */
      }
    }, 80);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [preview]);
  return uris;
}

/** One-tap looks as a swipeable strip. */
function Looks({ busy }: { busy: boolean }) {
  const C = useTheme();
  const styles = useStyles();
  const activeFilter = useEditor((s) => s.activeFilter);
  const thumbs = useLookThumbs();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {FILTERS.map((f) => {
        const active = activeFilter === f.id;
        return (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            accessibilityLabel={`${f.name} look`}
            accessibilityState={{ selected: active, disabled: busy }}
            disabled={busy}
            onPress={() => applyFilter(f.id)}
            style={({ pressed }) => [styles.filter, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <View style={[styles.swatchWrap, active && styles.swatchActive]}>
              {thumbs[f.id] ? (
                <Image source={{ uri: thumbs[f.id] }} style={styles.swatch} fadeDuration={0} accessibilityLabel={f.name} />
              ) : (
                <LinearGradient colors={f.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch} />
              )}
              {active && (
                <View style={styles.check}>
                  <Check size={13} color={C.onAccent} strokeWidth={3} />
                </View>
              )}
            </View>
            <Text numberOfLines={1} style={[styles.name, active && { color: C.text }]}>
              {f.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const GROUP_ICON = { Light: SunMedium, Colour: Palette, Detail: Sparkles } as const;

/** A tool tab of Adjust (Light, Colour, Detail): the open one shows its sliders, a dot marks a group you changed. */
function GroupTab({ group, active, onPress }: { group: ToneGroup; active: boolean; onPress: () => void }) {
  const C = useTheme();
  const styles = useStyles();
  const changed = useEditor((s) => TONE.some((t) => t.group === group && Math.abs(s.look[t.key as ToneKey]) > 0.005));
  const Icon = GROUP_ICON[group as keyof typeof GROUP_ICON] ?? Sparkles;
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.gTab, active && styles.gTabOn]}>
      <Icon size={17} color={active ? C.onAccent : C.text2} strokeWidth={2.1} />
      <Text style={[styles.gText, active && { color: C.onAccent }]}>{group}</Text>
      {changed && <View style={[styles.gDot, active && { backgroundColor: C.onAccent }]} />}
    </Pressable>
  );
}

/**
 * Edit: one-tap Looks, or Adjust: three tabs (Light, Colour, Detail) and, under the open one, all of its sliders
 * at once. Nothing to scroll through and nothing one by one: the way pro editors group their tools.
 */
export function EditPanel() {
  const styles = useStyles();
  const [mode, setMode] = useState<Mode>('looks');
  const [group, setGroup] = useState<ToneGroup>('Light');
  const busy = useEditor((s) => s.busy !== null);
  const changed = useEditor((s) => TONE.some((t) => Math.abs(s.look[t.key as ToneKey]) > 0.005));

  return (
    <>
      <Segmented label="Edit mode" options={MODES} value={mode} onChange={setMode} />
      {mode === 'looks' ? (
        <Looks busy={busy} />
      ) : (
        <>
          <View style={styles.gRow}>
            {TONE_GROUPS.map((g) => (
              <GroupTab key={g} group={g} active={g === group} onPress={() => setGroup(g)} />
            ))}
            {changed && (
              <Pressable accessibilityRole="button" accessibilityLabel="Reset all edits" onPress={resetAdjustments} disabled={busy} hitSlop={8} style={styles.gReset}>
                <Text style={styles.reset}>Reset</Text>
              </Pressable>
            )}
          </View>
          {TONE.filter((t) => t.group === group).map((t) => (
            <ToneSlider key={t.key} def={t} disabled={busy} />
          ))}
        </>
      )}
    </>
  );
}

const useStyles = makeStyles((C) => ({
  gRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 21, backgroundColor: C.fill2, borderWidth: 1, borderColor: C.line },
  gTabOn: { backgroundColor: C.accent, borderColor: C.accent },
  gText: { color: C.text2, fontSize: 13.5, fontFamily: F.uiSemi },
  gDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  gReset: { paddingHorizontal: 6 },
  reset: { color: C.accent, fontSize: 13, fontFamily: F.uiSemi, textAlign: 'center', paddingVertical: 2 },
  strip: { gap: 12, paddingVertical: 2 },
  filter: { alignItems: 'center', gap: 7, width: 76 },
  swatchWrap: { width: 72, height: 72, borderRadius: 20, padding: 3, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: C.accent },
  swatch: { flex: 1, borderRadius: 15, overflow: 'hidden' },
  check: { position: 'absolute', right: 4, bottom: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  name: { color: C.text2, fontSize: 12, fontFamily: F.uiSemi },
}));
