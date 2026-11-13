import { Pressable, ScrollView, Text, View } from 'react-native';
import { Contrast, Droplet, ImageMinus, Images, type LucideIcon, Palette } from '@/components/icons';
import { Slider } from '@/components/ui/Slider';
import { Tile } from '@/components/ui/Tile';
import type { Look } from '@/lib/gl/look';
import { SWATCHES, ensureMatte, setBackground, setLook, useEditor } from '@/lib/editor';
import { F, alpha, makeStyles, useTheme } from '@/theme';

const MODES: { value: Look['bg']; label: string; icon: LucideIcon }[] = [
  { value: 'none', label: 'Original', icon: Images },
  { value: 'blur', label: 'Blur', icon: Droplet },
  { value: 'color', label: 'Colour', icon: Palette },
  { value: 'mono', label: 'B&W', icon: Contrast },
  { value: 'transparent', label: 'Remove', icon: ImageMinus },
];

const rgb = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;

/** AI background: blur the surroundings, recolour them, make them black & white, or cut the subject out. */
export function BackgroundPanel() {
  const C = useTheme();
  const styles = useStyles();
  const bg = useEditor((s) => s.look.bg);
  const bgBlur = useEditor((s) => s.look.bgBlur);
  const bgColor = useEditor((s) => s.look.bgColor);
  const notice = useEditor((s) => s.bgNotice);
  const hasMask = useEditor((s) => s.mask !== null);
  const busy = useEditor((s) => s.busy !== null);

  return (
    <>
      <View style={styles.modes}>
        {MODES.map((m) => (
          <Tile key={m.value} icon={m.icon} label={m.label} active={bg === m.value} disabled={busy} onPress={() => void setBackground(m.value)} />
        ))}
      </View>

      {bg === 'blur' && (
        <Slider label="Blur strength" min={0} max={1} value={bgBlur} defaultValue={0.6} format={(v) => `${Math.round(v * 100)}`} onChange={(v) => setLook({ bgBlur: v })} />
      )}

      {bg === 'color' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatches} accessibilityRole="radiogroup">
          {SWATCHES.map((c) => {
            const active = bgColor.join(',') === c.join(',');
            return (
              <Pressable
                key={c.join(',')}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`Colour ${c.map((v) => Math.round(v * 255)).join(', ')}`}
                onPress={() => setLook({ bgColor: c })}
                style={[styles.swatch, active && styles.swatchActive]}
              >
                <View style={[styles.swatchFill, { backgroundColor: rgb(c) }]} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {notice ? (
        <View style={[styles.notice, notice.tone !== 'info' && { backgroundColor: alpha(notice.tone === 'ok' ? C.ok : C.warn, 0.1) }]}>
          <Text style={[styles.noticeText, { color: notice.tone === 'ok' ? C.ok : notice.tone === 'warn' ? C.warn : C.text2 }]}>{notice.text}</Text>
          {notice.tone === 'warn' && !hasMask && (
            <Pressable accessibilityRole="button" onPress={() => void ensureMatte()} hitSlop={6}>
              <Text style={styles.retry}>Try again</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Text style={styles.hint}>The subject stays sharp. Only what is behind it changes. “Remove” saves a transparent PNG.</Text>
      )}
    </>
  );
}

const useStyles = makeStyles((C) => ({
  modes: { flexDirection: 'row', gap: 6 },
  swatches: { gap: 10, paddingVertical: 2 },
  swatch: { width: 42, height: 42, borderRadius: 21, padding: 3, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: C.accent },
  swatchFill: { flex: 1, borderRadius: 17, borderWidth: 1, borderColor: C.line2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.fill1 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: F.uiMedium },
  retry: { color: C.accent, fontSize: 13, fontFamily: F.uiSemi },
  hint: { color: C.text3, fontSize: 12.5, lineHeight: 18, fontFamily: F.ui, textAlign: 'center' },
}));
