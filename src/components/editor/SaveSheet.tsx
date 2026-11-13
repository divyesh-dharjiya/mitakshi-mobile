import { Text, View } from 'react-native';
import { Columns2, Copy, Download, Share2 } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { Slider } from '@/components/ui/Slider';
import { L } from '@/lib/labels';
import { copyImage, downloadComparison, downloadImage, exportType, type ExportFormat, shareImage, useEditor } from '@/lib/editor';
import { fmtMP, fmtSize } from '@/lib/format';
import { F, makeStyles } from '@/theme';

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WebP' },
];

const close = () => useEditor.setState({ saveOpen: false });
/** Close the sheet first, so the progress overlay and the share sheet are not hidden behind it. */
const then = (fn: () => Promise<void>) => () => {
  close();
  setTimeout(() => void fn(), 250);
};

/** Save and share: full resolution with every edit applied, in the chosen format. */
export function SaveSheet() {
  const styles = useStyles();
  const open = useEditor((s) => s.saveOpen);
  const work = useEditor((s) => s.work);
  const changed = useEditor((s) => s.historyDepth > 0);
  const exFormat = useEditor((s) => s.exFormat);
  const exQuality = useEditor((s) => s.exQuality);
  // Re-render when the inputs of exportType() change, so the label never disagrees with the file.
  useEditor((s) => s.look.bg);
  useEditor((s) => s.mask);
  if (!work) return null;
  const type = exportType();

  return (
    <Sheet open={open} title="Save photo" onClose={close}>
      <Text style={styles.info}>
        {fmtSize(work.width, work.height)} · {fmtMP(work.width, work.height)} · {type.split('/')[1].toUpperCase()}
        {type !== exFormat ? ' (keeps the transparent background)' : ''}
      </Text>
      <Button variant="primary" size="lg" block icon={Download} onPress={then(downloadImage)}>
        {L.saveFull}
      </Button>
      <View style={styles.row}>
        <Button variant="secondary" icon={Share2} style={{ flex: 1 }} onPress={then(shareImage)}>
          Share
        </Button>
        <Button variant="secondary" icon={Copy} style={{ flex: 1 }} onPress={then(copyImage)}>
          Copy
        </Button>
      </View>
      {changed && (
        <Button variant="secondary" icon={Columns2} block onPress={then(downloadComparison)}>
          Save before / after image
        </Button>
      )}

      <Text style={styles.label}>Format</Text>
      <Segmented label="File format" options={FORMATS} value={exFormat} onChange={(v) => useEditor.setState({ exFormat: v })} />
      {exFormat !== 'image/png' && (
        <Slider
          label="Quality"
          min={0.5}
          max={1}
          step={0.01}
          value={exQuality}
          defaultValue={0.92}
          format={(v) => String(Math.round(v * 100))}
          onChange={(v) => useEditor.setState({ exQuality: v })}
        />
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((C) => ({
  info: { color: C.text3, fontSize: 13, fontFamily: F.uiMedium, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 8 },
  label: { color: C.text2, fontSize: 13, fontFamily: F.uiSemi, marginTop: 6 },
}));
