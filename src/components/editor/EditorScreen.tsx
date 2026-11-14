import { useEffect } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackgroundPanel } from '@/components/panels/BackgroundPanel';
import { CropPanel } from '@/components/panels/CropPanel';
import { EditPanel } from '@/components/panels/EditPanel';
import { EnhancePanel } from '@/components/panels/EnhancePanel';
import { ArrowLeft, Columns2, Crop, Download, Eye, Layers, type LucideIcon, Maximize, SlidersHorizontal, Undo2, WandSparkles } from '@/components/icons';
import { Canvas } from '@/components/studio/Canvas';
import { ask } from '@/lib/dialog';
import { autoEnhance, closePhoto, fitView, setHold, setTab, type Tab, toggleCompare, undo, useEditor } from '@/lib/editor';
import { F, WIDE, makeStyles, useTheme } from '@/theme';

const TOOLS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'enhance', label: 'Enhance', icon: WandSparkles },
  { id: 'edit', label: 'Edit', icon: SlidersHorizontal },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'background', label: 'Backdrop', icon: Layers },
];

function renderPanel(tab: Tab) {
  switch (tab) {
    case 'enhance':
      return <EnhancePanel />;
    case 'edit':
      return <EditPanel />;
    case 'crop':
      return <CropPanel />;
    case 'background':
      return <BackgroundPanel />;
  }
}

/** Back to the home screen, asking first when there are edits that were not saved. */
async function goBack() {
  const s = useEditor.getState();
  if (s.busy) return;
  if (s.historyDepth > 0 && !(await ask('Discard this photo?', 'Your changes have not been saved to the gallery.', 'Discard', true))) return;
  closePhoto();
}

function Header({ wide }: { wide: boolean }) {
  const C = useTheme();
  const styles = useStyles();
  const historyDepth = useEditor((s) => s.historyDepth);
  const busy = useEditor((s) => s.busy !== null);
  const autoOn = useEditor((s) => s.activeFilter === 'auto');
  return (
    <View style={[styles.header, wide && { paddingHorizontal: 20 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => void goBack()} style={({ pressed }) => [styles.round, pressed && styles.pressed]} hitSlop={6}>
        <ArrowLeft size={21} color={C.text} />
      </Pressable>
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={autoOn ? 'Auto fix is on: tap to reset every adjustment' : 'Auto fix: set light and colour for this photo'}
        accessibilityState={{ selected: autoOn, disabled: busy }}
        disabled={busy}
        onPress={autoEnhance}
        style={({ pressed }) => [styles.auto, autoOn && styles.autoOn, busy && { opacity: 0.4 }, pressed && styles.pressed]}
      >
        <WandSparkles size={17} color={autoOn ? C.onAccent : C.accent} strokeWidth={2.3} />
        <Text style={[styles.autoText, autoOn && { color: C.onAccent }]}>{autoOn ? 'Auto on' : 'Auto'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo"
        disabled={!historyDepth || busy}
        onPress={() => void undo()}
        style={({ pressed }) => [styles.round, (!historyDepth || busy) && { opacity: 0.35 }, pressed && styles.pressed]}
        hitSlop={6}
      >
        <Undo2 size={20} color={C.text} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save"
        disabled={busy}
        onPress={() => useEditor.setState({ saveOpen: true })}
        style={({ pressed }) => [styles.save, busy && { opacity: 0.4 }, pressed && styles.pressed]}
      >
        <LinearGradient {...C.grad} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.saveRow}>
          <Download size={18} color={C.onAccent} strokeWidth={2.4} />
          <Text style={styles.saveText}>Save</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Floating buttons on the photo: before / after split, press-and-hold original, fit to screen. */
function StageControls() {
  const styles = useStyles();
  const compare = useEditor((s) => s.compare);
  // Something to compare against: an AI step, or any change to light, colour or background. Not after a crop or rotation.
  const changed = useEditor((s) => !s.geom && (s.historyDepth > 0 || s.look.bg !== 'none' || s.activeFilter !== 'none' || Object.values(s.look).some((v) => typeof v === 'number' && Math.abs(v) > 0.005 && v !== s.look.bgBlur)));
  return (
    <View style={styles.controls} pointerEvents="box-none">
      <View style={styles.controlGroup}>
        {changed && (
          <Pressable accessibilityRole="button" accessibilityLabel="Compare before and after" accessibilityState={{ selected: compare }} onPress={toggleCompare} style={[styles.control, compare && styles.controlOn]}>
            <Columns2 size={18} color="#fff" />
          </Pressable>
        )}
        {changed && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hold to see the original"
            onPressIn={() => setHold(true)}
            onPressOut={() => setHold(false)}
            style={({ pressed }) => [styles.control, pressed && styles.controlOn]}
          >
            <Eye size={18} color="#fff" />
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Fit to screen" onPress={fitView} style={styles.control}>
          <Maximize size={17} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

/** The four tools: along the bottom on a phone, down the left edge on a tablet or in landscape. */
function ToolBar({ vertical }: { vertical: boolean }) {
  const C = useTheme();
  const styles = useStyles();
  const tab = useEditor((s) => s.tab);
  const busy = useEditor((s) => s.busy !== null);
  return (
    <View style={vertical ? styles.rail : styles.toolbar} accessibilityRole="tablist">
      {TOOLS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active, disabled: busy }}
            disabled={busy}
            onPress={() => setTab(id)}
            style={[styles.tool, vertical && styles.toolVertical]}
          >
            <View style={styles.toolIcon}>
              {active && <View style={styles.toolIconOn} />}
              <Icon size={21} color={active ? C.accent : C.text3} strokeWidth={active ? 2.3 : 2} />
            </View>
            <Text numberOfLines={1} style={[styles.toolLabel, active && { color: C.text }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The editor. The photo gets every pixel the tools do not need: a phone stacks photo, tool panel and
 * tool bar; a tablet or a phone in landscape puts the tools in a rail and the panel beside the photo.
 */
export function EditorScreen() {
  const styles = useStyles();
  const tab = useEditor((s) => s.tab);
  const hasPhoto = useEditor((s) => s.work !== null);
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE || width > height * 1.15;

  // Android back button: leave the editor instead of closing the app.
  useEffect(() => {
    if (!hasPhoto) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = useEditor.getState();
      if (s.saveOpen) useEditor.setState({ saveOpen: false });
      else void goBack();
      return true;
    });
    return () => sub.remove();
  }, [hasPhoto]);

  const stage = (
    <View style={[styles.stage, wide && styles.stageWide]}>
      <Canvas insetBottom={0} />
      {hasPhoto && <StageControls />}
    </View>
  );
  // Keyed by tab so each tool opens scrolled to the top.
  const panel = (maxHeight?: number) => (
    <ScrollView key={tab} style={maxHeight ? { maxHeight } : { flex: 1 }} contentContainerStyle={styles.panelBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {renderPanel(tab)}
    </ScrollView>
  );

  if (wide) {
    return (
      <View style={[styles.root, { flexDirection: 'row' }]}>
        <ToolBar vertical />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Header wide />
          {stage}
        </View>
        <View style={styles.side}>{panel()}</View>
      </View>
    );
  }
  return (
    <View style={styles.root}>
      <Header wide={false} />
      {stage}
      <View style={styles.panel}>{panel(Math.min(tab === 'edit' ? 440 : 340, Math.max(190, height * (tab === 'edit' ? 0.46 : 0.36))))}</View>
      <ToolBar vertical={false} />
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill2, borderWidth: 1, borderColor: C.line },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentLine },
  autoOn: { backgroundColor: C.accent, borderColor: C.accent },
  autoText: { color: C.accent, fontSize: 15, fontFamily: F.uiBold },
  save: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 42, paddingHorizontal: 18, borderRadius: 21, overflow: 'hidden' },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  saveText: { color: C.onAccent, fontSize: 15, fontFamily: F.uiBold },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  stage: { flex: 1, minHeight: 0, overflow: 'hidden', marginHorizontal: 10, borderRadius: 26, backgroundColor: C.stage, borderWidth: 1, borderColor: C.line },
  stageWide: { marginHorizontal: 12, marginBottom: 12 },
  controls: { position: 'absolute', right: 12, bottom: 12, zIndex: 4 },
  controlGroup: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 24, backgroundColor: C.float },
  control: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  controlOn: { backgroundColor: C.accent },
  panel: { backgroundColor: C.surface, marginTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: C.line },
  panelBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 12 },
  side: { width: 372, backgroundColor: C.surface, borderLeftWidth: 1, borderColor: C.line, paddingTop: 8 },
  toolbar: { flexDirection: 'row', paddingHorizontal: 6, paddingTop: 6, paddingBottom: 6, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line },
  rail: { width: 84, paddingTop: 14, gap: 6, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.line },
  tool: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  toolVertical: { flex: 0, paddingVertical: 8 },
  toolIcon: { width: 56, height: 34, borderRadius: 17, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  // A pill mounted only while selected: toggling just the background colour of an existing view can drop its rounded corners on Android.
  toolIconOn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.accentSoft },
  toolLabel: { color: C.text3, fontSize: 11.5, fontFamily: F.uiSemi },
}));
