import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Maximize2, RotateCcw, ScanFace, Sparkles, WandSparkles } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { OptionPill } from '@/components/ui/Tile';
import type { FaceInfo } from '@/lib/ai/protocol';
import { useBitmapUri } from '@/hooks/useBitmapUri';
import { missingEngines, modelsFor, revert, runEnhance, setFaceEnabled, setFaceStrength, setFidelity, useEditor } from '@/lib/editor';
import { modelBytes } from '@/lib/ai/registry';
import { clamp, fmtMB, fmtSize } from '@/lib/format';
import { F, makeStyles, useTheme } from '@/theme';

const SIZES = { 1: 'Original', 2: '2× HD', 4: '4× Ultra' } as const;
const NEXT_SIZE = { 1: 2, 2: 4, 4: 1 } as const;

function Thumb({ bitmap, label }: { bitmap: ImageBitmap; label: string }) {
  const styles = useStyles();
  const uri = useBitmapUri(bitmap);
  return (
    <View style={styles.thumb}>
      {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} accessibilityLabel={label} />}
      <Text style={styles.thumbTag}>{label}</Text>
    </View>
  );
}

function FaceCard({ index, info, strength, enabled }: { index: number; info: FaceInfo; strength: number; enabled: boolean }) {
  const styles = useStyles();
  const C = useTheme();
  return (
    <View style={[styles.faceCard, !enabled && { opacity: 0.55 }]}>
      <View style={styles.thumbs}>
        <Thumb bitmap={info.before} label="Before" />
        <Thumb bitmap={info.after} label="After" />
      </View>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled }} onPress={() => setFaceEnabled(index, !enabled)} style={styles.toggle}>
        <Text style={styles.faceName}>Face {index + 1}</Text>
        <View style={[styles.track, enabled && { backgroundColor: C.accent }]}>
          <View style={[styles.knob, enabled && { left: 17 }]} />
        </View>
      </Pressable>
      <Slider label="Strength" min={0} max={1} defaultValue={1} value={strength} disabled={!enabled} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setFaceStrength(index, v)} />
    </View>
  );
}

/** AI Enhance: three steps to switch on, one big button, then the result's face controls. */
export function EnhancePanel() {
  const C = useTheme();
  const styles = useStyles();
  const busy = useEditor((s) => s.busy !== null);
  const work = useEditor((s) => s.work);
  const scan = useEditor((s) => s.scan);
  const opts = useEditor((s) => s.opts);
  const faces = useEditor((s) => s.faces);
  const fidelity = useEditor((s) => s.fidelity);
  const autoEdit = useEditor((s) => s.autoEdit);
  // Something was done to the photo (Undo has a step): offer "Enhance again" and the way back.
  const edited = useEditor((s) => s.historyDepth > 0);
  useEditor((s) => s.cached); // re-render when an engine finishes downloading
  if (!work) return null;

  const setOpts = (patch: Partial<typeof opts>) => useEditor.setState((s) => ({ opts: { ...s.opts, ...patch } }));

  // Predicted output size and what still has to be downloaded.
  const k = opts.scale > 1 ? clamp(Math.sqrt(16e6 / (work.width * work.height * opts.scale * opts.scale)), 0, 1) : 1;
  const ow = Math.round(work.width * k) * opts.scale;
  const oh = Math.round(work.height * k) * opts.scale;
  const download = missingEngines(modelsFor(opts)).reduce((sum, m) => sum + modelBytes(m), 0);
  const faceCount = faces?.faces.length ?? 0;
  const slow = opts.scale > 1 && (work.width * work.height) / 1e6 > 2;

  return (
    <>
      <View style={styles.tiles}>
        <OptionPill icon={ScanFace} label="Faces" value={opts.faces ? (scan ? `${scan.faces || 'No'} found` : 'On') : 'Off'} active={opts.faces} disabled={busy} onPress={() => setOpts({ faces: !opts.faces })} />
        <OptionPill icon={WandSparkles} label="Auto edit" value={autoEdit ? 'On' : 'Off'} active={autoEdit} disabled={busy} onPress={() => useEditor.setState({ autoEdit: !autoEdit })} />
        <OptionPill icon={Maximize2} label="Size" value={SIZES[opts.scale]} active={opts.scale > 1} disabled={busy} onPress={() => setOpts({ scale: NEXT_SIZE[opts.scale] })} />
      </View>

      <Button variant="primary" size="lg" block icon={Sparkles} disabled={busy || (!opts.faces && opts.scale === 1 && !autoEdit)} onPress={() => void runEnhance()}>
        {edited ? 'Enhance again' : 'Enhance'}
      </Button>
      <Text style={styles.info}>
        Result {fmtSize(ow, oh)}
        {download ? ` · ${fmtMB(download)} one-time download` : ''}
      </Text>

      {slow && <Text style={styles.warn}>This photo is already large: upscaling it takes a few minutes. Original size is much faster.</Text>}

      {faceCount > 0 && faces && (
        <View style={styles.faces}>
          <Slider
            label="Face enhancement"
            value={fidelity}
            min={0}
            max={1}
            defaultValue={0.75}
            format={(v) => `${Math.round(v * 100)}%`}
            ends={['Natural', 'Enhanced']}
            onChange={setFidelity}
          />
          {faceCount > 1 && (
            <>
              <Text style={styles.sub}>Each face</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {faces.faces.map((info, i) => (
                  <FaceCard key={i} index={i} info={info} strength={faces.strengths[i]} enabled={faces.enabled[i]} />
                ))}
              </ScrollView>
            </>
          )}
        </View>
      )}

      {edited && (
        <Pressable accessibilityRole="button" onPress={() => void revert()} disabled={busy} style={styles.revert} hitSlop={8}>
          <RotateCcw size={14} color={C.text3} />
          <Text style={styles.revertText}>Back to the original photo</Text>
        </Pressable>
      )}
    </>
  );
}

const useStyles = makeStyles((C) => ({
  tiles: { flexDirection: 'row', gap: 8 },
  info: { color: C.text3, fontSize: 12, fontFamily: F.uiMedium, textAlign: 'center', marginTop: -4 },
  warn: { color: C.warn, fontSize: 12, lineHeight: 17, fontFamily: F.uiMedium, textAlign: 'center' },
  faces: { gap: 10 },
  sub: { color: C.text2, fontSize: 13, fontFamily: F.uiSemi, marginTop: 4 },
  row: { gap: 10 },
  revert: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  revertText: { color: C.text3, fontSize: 12.5, fontFamily: F.uiSemi },
  faceCard: { width: 220, gap: 10, padding: 12, borderRadius: 18, backgroundColor: C.fill1, borderWidth: 1, borderColor: C.line },
  thumbs: { flexDirection: 'row', gap: 6 },
  thumb: { flex: 1, aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: C.fill2 },
  thumbTag: { position: 'absolute', left: 5, bottom: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontFamily: F.uiSemi },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faceName: { color: C.text, fontSize: 14, fontFamily: F.uiSemi },
  track: { width: 38, height: 23, borderRadius: 12, backgroundColor: C.fill3 },
  knob: { position: 'absolute', top: 3, left: 3, width: 17, height: 17, borderRadius: 9, backgroundColor: '#fff' },
}));
