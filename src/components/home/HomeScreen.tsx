import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Logo } from '@/components/brand/Logo';
import { ChevronRight, Crop, Download, ImagePlus, Images, Layers, type LucideIcon, Moon, Palette, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, WandSparkles, WifiOff, Zap } from '@/components/icons';
import { Aurora } from '@/components/ui/Aurora';
import { pickBatchPhotos, type StartIntent, startWith, useEditor } from '@/lib/editor';
import { F, WIDE, alpha, makeStyles, toggleMode, useTheme } from '@/theme';
import { BeforeAfter } from './BeforeAfter';

/** Each tool appears once. Face restore and upscaling are steps of Enhance, not separate cards. */
const TOOLS: { intent: StartIntent; icon: LucideIcon; title: string; text: string; tag: string }[] = [
  { intent: 'auto', icon: WandSparkles, title: 'Auto fix', text: 'Light and colour in one tap', tag: '1 tap' },
  { intent: 'old', icon: Palette, title: 'Colorize', text: 'Old black & white photos', tag: 'AI' },
  { intent: 'background', icon: Layers, title: 'Background', text: 'Blur, change or remove', tag: 'AI' },
  { intent: 'crop', icon: Crop, title: 'Crop & rotate', text: 'Frame it just right', tag: 'Free' },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ImagePlus, title: 'Pick a photo', text: 'From your gallery' },
  { icon: Sparkles, title: 'Tap Enhance', text: 'Faces, detail, colour' },
  { icon: Download, title: 'Save in HD', text: 'No watermark' },
];

const PERKS: { icon: LucideIcon; text: string }[] = [
  { icon: ShieldCheck, text: 'Private' },
  { icon: WifiOff, text: 'Works offline' },
  { icon: Zap, text: 'No watermark' },
];

function ToolCard({ intent, icon: Icon, title, text, tag }: (typeof TOOLS)[number]) {
  const C = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${text}`} onPress={() => startWith(intent)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardTop}>
        <LinearGradient colors={[alpha(C.accent, 0.32), alpha(C.accentAlt, 0.16)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardIcon}>
          <Icon size={22} color={C.accent} strokeWidth={2.1} />
        </LinearGradient>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardText}>{text}</Text>
    </Pressable>
  );
}

/** First screen: the proof (a before/after you can drag) with the headline and the one big action on it, then the other tools. */
export function HomeScreen() {
  const C = useTheme();
  const styles = useStyles();
  const busy = useEditor((s) => s.busy !== null);
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const dark = C.mode === 'dark';

  const hero = (
    <View style={[styles.hero, wide && styles.heroWide]}>
      <BeforeAfter fill />
      <LinearGradient colors={[alpha(C.bg, 0), alpha(C.bg, dark ? 0.84 : 0.78), C.bg]} locations={[0, 0.5, 1]} style={styles.scrim} pointerEvents="none" />
      {/* Editor furniture over the picture: a tool column, so the first thing you see already looks like an editor. */}
      <View style={styles.toolbar} pointerEvents="none">
        {[SlidersHorizontal, Crop, Layers, WandSparkles].map((Icon, i) => (
          <View key={i} style={[styles.toolDot, i === 0 && { backgroundColor: C.accentSoft }]}>
            <Icon size={17} color={i === 0 ? C.accent : C.text2} strokeWidth={2.1} />
          </View>
        ))}
      </View>
      <View style={styles.copy} pointerEvents="box-none">
        <Text style={styles.title}>
          Make every photo{'\n'}sharp <Text style={{ color: C.accent }}>& HD</Text>
        </Text>
        <Text style={styles.sub}>Sharpen faces, add detail and bring old memories back to life.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a photo to enhance"
          disabled={busy}
          onPress={() => startWith('enhance')}
          style={({ pressed }) => [styles.cta, busy && { opacity: 0.5 }, pressed && styles.pressed]}
        >
          <LinearGradient {...C.grad} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <ImagePlus size={22} color={C.onAccent} strokeWidth={2.2} />
          <Text style={styles.ctaText}>Choose a photo</Text>
        </Pressable>
      </View>
    </View>
  );

  const rest = (
    <>
      <View style={styles.perks}>
        {PERKS.map(({ icon: Icon, text }) => (
          <View key={text} style={styles.perk}>
            <Icon size={14} color={C.accent} />
            <Text style={styles.perkText}>{text}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>More tools</Text>
      <View style={styles.grid}>
        {TOOLS.map((t) => (
          <ToolCard key={t.intent} {...t} />
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Batch enhance: a whole album at once" onPress={pickBatchPhotos} style={({ pressed }) => [styles.batch, pressed && styles.pressed]}>
        <LinearGradient colors={[alpha(C.accent, 0.32), alpha(C.accentAlt, 0.16)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardIcon}>
          <Images size={22} color={C.accent} />
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle}>Batch enhance</Text>
          <Text style={styles.cardText}>A whole album at once, saved as a ZIP</Text>
        </View>
        <ChevronRight size={20} color={C.text3} />
      </Pressable>

      <Text style={styles.section}>How it works</Text>
      <View style={styles.steps}>
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <View key={title} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Icon size={20} color={C.accent} strokeWidth={2.1} />
            <Text style={styles.stepTitle}>{title}</Text>
            <Text style={styles.stepText}>{text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.trust}>
        <View style={styles.trustIcon}>
          <ShieldCheck size={22} color={C.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle}>Private by design</Text>
          <Text style={styles.cardText}>Photos are processed on your phone. Nothing is uploaded, and there is no sign-up.</Text>
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.root}>
      <Aurora />
      <View style={[styles.header, wide && styles.headerWide]}>
        <Logo size={40} />
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          onPress={toggleMode}
          style={({ pressed }) => [styles.round, pressed && styles.pressed]}
          hitSlop={6}
        >
          {dark ? <Sun size={20} color={C.text2} /> : <Moon size={20} color={C.text2} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => useEditor.setState({ settingsOpen: true })} style={({ pressed }) => [styles.round, pressed && styles.pressed]} hitSlop={6}>
          <Settings size={20} color={C.text2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.inner, wide && styles.innerWide]} showsVerticalScrollIndicator={false}>
        {wide ? (
          <View style={styles.twoCol}>
            <View style={{ flex: 1.2 }}>{hero}</View>
            <View style={{ flex: 1, gap: 14 }}>{rest}</View>
          </View>
        ) : (
          <>
            {hero}
            <View style={{ gap: 14 }}>{rest}</View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10 },
  headerWide: { paddingHorizontal: 32 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill2, borderWidth: 1, borderColor: C.line },
  inner: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 20 },
  innerWide: { maxWidth: 1080, paddingHorizontal: 32 },
  twoCol: { flexDirection: 'row', gap: 32, alignItems: 'flex-start' },
  hero: { borderRadius: 34, overflow: 'hidden', aspectRatio: 0.82, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2 },
  heroWide: { aspectRatio: 1 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '66%' },
  toolbar: { position: 'absolute', right: 14, top: 64, gap: 4, padding: 5, borderRadius: 24, backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder },
  toolDot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  copy: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, gap: 8 },
  title: { color: C.text, fontSize: 36, lineHeight: 40, fontFamily: F.headBold, letterSpacing: -1.3 },
  sub: { color: C.text2, fontSize: 14.5, lineHeight: 21, fontFamily: F.ui, marginBottom: 6 },
  cta: { height: 58, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden', shadowColor: C.accent, shadowOpacity: C.mode === 'dark' ? 0.5 : 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  ctaText: { color: C.onAccent, fontSize: 17.5, fontFamily: F.uiBold, letterSpacing: -0.2 },
  perks: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.fill1, borderWidth: 1, borderColor: C.line },
  perkText: { color: C.text2, fontSize: 12.5, fontFamily: F.uiMedium },
  section: { color: C.text, fontSize: 21, fontFamily: F.head, letterSpacing: -0.5, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexBasis: '47%', flexGrow: 1, padding: 16, borderRadius: 26, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  cardIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.accentLine },
  tag: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: C.accentSoft },
  tagText: { color: C.accent, fontSize: 11, fontFamily: F.uiBold, letterSpacing: 0.3 },
  cardTitle: { color: C.text, fontSize: 15.5, fontFamily: F.uiSemi },
  cardText: { color: C.text3, fontSize: 12.5, lineHeight: 17, fontFamily: F.ui, marginTop: 2 },
  batch: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 26, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  steps: { flexDirection: 'row', gap: 10 },
  step: { flex: 1, gap: 6, padding: 14, borderRadius: 22, backgroundColor: C.fill1, borderWidth: 1, borderColor: C.line },
  stepNum: { position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSoft },
  stepNumText: { color: C.accent, fontSize: 11, fontFamily: F.uiBold },
  stepTitle: { color: C.text, fontSize: 13.5, fontFamily: F.uiSemi, marginTop: 4 },
  stepText: { color: C.text3, fontSize: 11.5, lineHeight: 16, fontFamily: F.ui },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 26, backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentLine },
  trustIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill2 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
}));
