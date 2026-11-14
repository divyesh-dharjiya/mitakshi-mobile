import { memo } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CircleAlert, CircleCheck, Download, FileArchive, ImagePlus, Sparkles, X } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/Button';
import { Segmented, Switch } from '@/components/ui/primitives';
import { addBatchFiles, type BatchItem, clearBatch, closeBatch, downloadBatchItem, downloadBatchZip, pickFiles, removeBatchItem, runBatch, useEditor } from '@/lib/editor';
import { L } from '@/lib/labels';
import { F, R, alpha, isHovered, makeStyles, useTheme } from '@/theme';

const SCALES = [
  { value: '1', label: 'Original' },
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
];

/** One photo in the batch: its thumbnail, status, progress and per-photo actions. */
const BatchItemCard = memo(function BatchItemCard({ item, locked, width }: { item: BatchItem; locked: boolean; width: number }) {
  const C = useTheme();
  const styles = useStyles();
  const percent = Math.round(item.progress * 100);
  return (
    <View style={[styles.item, { width }, item.status === 'error' && { borderColor: alpha(C.danger, 0.45) }, item.status === 'done' && { borderColor: alpha(C.ok, 0.4) }]}>
      <View style={styles.thumb}>
        <Image source={{ uri: item.resultUrl ?? item.url }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={item.name} />
        {item.status === 'done' && (
          <View style={styles.badge}>
            <CircleCheck size={20} color={C.ok} />
          </View>
        )}
        {item.status === 'error' && (
          <View style={styles.badge}>
            <CircleAlert size={20} color={C.danger} />
          </View>
        )}
        {item.status === 'working' && (
          <>
            <View style={styles.working}>
              <Text numberOfLines={1} style={styles.workingText}>
                {item.stage || 'Working…'} {percent}%
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { width: `${percent}%` }]} />
            </View>
          </>
        )}
      </View>
      <View style={styles.metaRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.name}>
            {item.name}
          </Text>
          <Text numberOfLines={1} style={styles.detail}>
            {item.status === 'queued' ? 'Waiting' : item.status === 'working' ? 'Enhancing…' : item.detail}
          </Text>
        </View>
        {item.status === 'done' && <IconButton icon={Download} label={L.saveOne} size="sm" onPress={() => downloadBatchItem(item)} />}
        {!locked && <IconButton icon={X} label="Remove" size="sm" onPress={() => removeBatchItem(item.id)} />}
      </View>
    </View>
  );
});

/** Enhance a whole album: settings, a grid of photos with live progress, and ZIP download. */
export function BatchModal() {
  const C = useTheme();
  const styles = useStyles();
  const open = useEditor((s) => s.batchOpen);
  const items = useEditor((s) => s.batchItems);
  const running = useEditor((s) => s.batchRunning);
  const scale = useEditor((s) => s.batchScale);
  const faces = useEditor((s) => s.batchFaces);
  const { width, height } = useWindowDimensions();
  if (!open) return null;

  const modalW = Math.min(width - 24, 980);
  const cols = modalW > 760 ? 4 : modalW > 520 ? 3 : 2;
  const tileW = Math.floor((modalW - 40 - (cols - 1) * 12) / cols);
  const done = items.filter((i) => i.status === 'done').length;
  const pending = items.some((i) => i.status === 'queued' || i.status === 'error');
  const summary = items.length ? `${done} of ${items.length} done${running ? ' · working…' : ''}` : 'No photos yet';
  const compact = modalW < 600;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={closeBatch}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { width: modalW, maxHeight: height - 24 }]} accessibilityRole="none" accessibilityLabel="Batch enhance">
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Batch enhance</Text>
              <Text style={styles.desc}>Enhance a whole album with one tap, then download the photos one by one or as a single ZIP.</Text>
            </View>
            <IconButton icon={X} label="Close" onPress={closeBatch} />
          </View>

          <View style={[styles.options, compact && { flexDirection: 'column' }]}>
            <View style={styles.option}>
              <Switch label="Restore faces" checked={faces} disabled={running} onChange={(batchFaces) => useEditor.setState({ batchFaces })} />
            </View>
            <View style={[styles.option, { justifyContent: 'center' }]}>
              <Segmented
                label="Output size"
                options={SCALES}
                value={String(scale)}
                disabled={running}
                onChange={(v) => useEditor.setState({ batchScale: Number(v) as 1 | 2 | 4 })}
              />
            </View>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.grid}>
            {items.map((item) => (
              <BatchItemCard key={item.id} item={item} locked={running} width={tileW} />
            ))}
            <Pressable
              accessibilityRole="button"
              disabled={running}
              onPress={() => pickFiles(addBatchFiles, true)}
              style={(st) => [styles.addTile, { width: tileW }, isHovered(st) && { borderColor: C.accentLine }, running && { opacity: 0.4 }]}
            >
              <ImagePlus size={24} color={C.accent} />
              <Text style={styles.addText}>Add photos</Text>
              <Text style={styles.addSub}>{L.addHint}</Text>
            </Pressable>
          </ScrollView>

          <View style={[styles.foot, compact && { flexDirection: 'column', alignItems: 'stretch' }]}>
            <Text style={styles.summary}>{summary}</Text>
            <View style={styles.footActions}>
              <Button variant="ghost" onPress={clearBatch} disabled={running || items.length === 0}>
                Clear
              </Button>
              <Button variant="secondary" icon={FileArchive} onPress={() => void downloadBatchZip()} disabled={running || done === 0}>
                {compact ? 'ZIP' : L.zip}
              </Button>
              <Button variant="primary" icon={Sparkles} onPress={() => void runBatch()} disabled={running || !pending}>
                {running ? 'Working…' : 'Enhance all'}
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((C) => ({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.scrim, padding: 12 },
  modal: {
    borderRadius: R.xl,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.glassBorder,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 20, paddingBottom: 14 },
  title: { color: C.text, fontSize: 20, fontFamily: F.head },
  desc: { color: C.text3, fontSize: 13, lineHeight: 19, fontFamily: F.ui },
  options: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 14 },
  option: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, paddingVertical: 4, paddingBottom: 16 },
  item: { borderRadius: 16, backgroundColor: C.fill1, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  thumb: { aspectRatio: 1, backgroundColor: C.fill2 },
  badge: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(7,8,12,0.75)', alignItems: 'center', justifyContent: 'center' },
  working: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,8,12,0.55)', padding: 8 },
  workingText: { color: '#fff', fontSize: 12, fontFamily: F.uiSemi, textAlign: 'center' },
  barTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  bar: { height: 4, backgroundColor: C.accent },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8, paddingLeft: 10, paddingRight: 4 },
  name: { color: C.text, fontSize: 12.5, fontFamily: F.uiSemi },
  detail: { color: C.text3, fontSize: 11.5, fontFamily: F.ui },
  addTile: {
    aspectRatio: 0.82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.line2,
  },
  addText: { color: C.text, fontSize: 13.5, fontFamily: F.uiSemi },
  addSub: { color: C.text3, fontSize: 12, fontFamily: F.ui },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: C.line },
  summary: { color: C.text2, fontSize: 13, fontFamily: F.uiMedium },
  footActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
}));
