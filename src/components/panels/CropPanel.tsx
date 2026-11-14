import { useState } from 'react';
import { Text, View } from 'react-native';
import { ArrowLeftRight, ArrowUpDown, Crop, RotateCw } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Chip, Tile } from '@/components/ui/Tile';
import { cropTo, flip, rotate, useEditor } from '@/lib/editor';
import { F, makeStyles } from '@/theme';

const RATIOS: { label: string; aspect: number }[] = [
  { label: '1:1', aspect: 1 },
  { label: '4:5', aspect: 4 / 5 },
  { label: '3:4', aspect: 3 / 4 },
  { label: '9:16', aspect: 9 / 16 },
  { label: '4:3', aspect: 4 / 3 },
  { label: '16:9', aspect: 16 / 9 },
];

/** Rotate, flip and crop to a shape (from the centre). Every step can be undone. */
export function CropPanel() {
  const styles = useStyles();
  const busy = useEditor((s) => s.busy !== null);
  const [ratio, setRatio] = useState<number | null>(null);

  return (
    <>
      <View style={styles.row}>
        <Tile icon={RotateCw} label="Rotate" disabled={busy} onPress={() => void rotate(1)} />
        <Tile icon={ArrowLeftRight} label="Flip" disabled={busy} onPress={() => void flip('x')} />
        <Tile icon={ArrowUpDown} label="Mirror" disabled={busy} onPress={() => void flip('y')} />
      </View>
      <Text style={styles.label}>Crop to</Text>
      {/* Three to a row, all the same width: every shape is visible without scrolling. */}
      <View style={styles.grid}>
        {RATIOS.map((r) => (
          <View key={r.label} style={styles.cell}>
            <Chip label={r.label} active={ratio === r.aspect} onPress={() => setRatio(ratio === r.aspect ? null : r.aspect)} />
          </View>
        ))}
      </View>
      <Button
        variant="primary"
        size="lg"
        block
        icon={Crop}
        disabled={busy || ratio === null}
        onPress={() => {
          if (ratio !== null) void cropTo(ratio);
          setRatio(null);
        }}
      >
        {ratio === null ? 'Choose a shape' : 'Crop'}
      </Button>
    </>
  );
}

const useStyles = makeStyles((C) => ({
  row: { flexDirection: 'row', gap: 8 },
  label: { color: C.text2, fontSize: 13, fontFamily: F.uiSemi },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { flexBasis: '30%', flexGrow: 1 },
}));
