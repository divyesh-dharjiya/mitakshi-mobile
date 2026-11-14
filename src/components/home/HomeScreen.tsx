import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Logo } from '@/components/brand/Logo';
import { Crop, ImagePlus, Images, Layers, type LucideIcon, Moon, Settings, ShieldCheck, Sun, WandSparkles, WifiOff, Zap } from '@/components/icons';
import { Aurora } from '@/components/ui/Aurora';
import { pickBatchPhotos, type StartIntent, startWith, useEditor } from '@/lib/editor';
import { F, WIDE, alpha, makeStyles, toggleMode, useTheme } from '@/theme';
import { BeforeAfter } from './BeforeAfter';

/** Each tool appears once. Face restore and upscaling are steps of Enhance, not separate cards. */
const TOOLS: { intent: StartIntent | 'batch'; icon: LucideIcon; title: string; text: string }[] = [
  { intent: 'auto', icon: WandSparkles, title: 'Auto fix', text: 'Light & colour' },
  { intent: 'background', icon: Layers, title: 'Background', text: 'Blur or remove' },
  { intent: 'crop', icon: Crop, title: 'Crop & rotate', text: 'Frame it right' },
  { intent: 'batch', icon: Images, title: 'Batch', text: 'A whole album' },
];

const PERKS: { icon: LucideIcon; text: string }[] = [
  { icon: ShieldCheck, text: 'Private' },
  { icon: WifiOff, text: 'Offline' },
  { icon: Zap, text: 'No watermark' },
];

function ToolCard({ intent, icon: Icon, title, text }: (typeof TOOLS)[number]) {
  const C = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${text}`} onPress={() => (intent === 'batch' ? pickBatchPhotos() : startWith(intent))} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardIcon}>
        <Icon size={20} color={C.accent} strokeWidth={2.1} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.cardText} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * First screen. Top to bottom: a live before / after that shows what the app does, one line of copy, the one
 * big action, then the other tools. On a normal phone the button is on screen without scrolling.
 */
export function HomeScreen() {
  const C = useTheme();
  const styles = useStyles();
  const busy = useEditor((s) => s.busy !== null);
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE;
  const dark = C.mode === 'dark';
  // The demo gets what the headline, the button and the header leave on screen (never taller than it is wide).
  const demoH = wide ? Math.min(520, height - 200) : Math.round(Math.max(200, Math.min(width - 32, height - 470)));

  const hero = (
    <View style={styles.hero}>
      <View style={[styles.demo, { height: demoH }]}>
        <BeforeAfter fill />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, wide && styles.titleWide]}>
          Make every photo{'\n'}
          <Text style={{ color: C.accent }}>sharp & HD</Text>
        </Text>
        <Text style={styles.sub}>Restore faces, add detail and bring old memories back to life, right on your phone.</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose a photo to enhance"
        disabled={busy}
        onPress={() => startWith('enhance')}
        style={({ pressed }) => [styles.cta, busy && { opacity: 0.5 }, pressed && styles.pressed]}
      >
        <LinearGradient {...C.grad} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.ctaRow}>
          <ImagePlus size={21} color={C.onAccent} strokeWidth={2.2} />
          <Text style={styles.ctaText}>Choose a photo</Text>
        </View>
      </Pressable>
      <View style={styles.perks}>
        {PERKS.map(({ icon: Icon, text }, i) => (
          <View key={text} style={styles.perk}>
            {i > 0 && <View style={styles.perkDot} />}
            <Icon size={13} color={C.text3} />
            <Text style={styles.perkText}>{text}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const rest = (
    <View style={styles.rest}>
      <Text style={styles.section}>More tools</Text>
      <View style={styles.grid}>
        {TOOLS.map((t) => (
          <ToolCard key={t.intent} {...t} />
        ))}
      </View>
      <View style={styles.trust}>
        <ShieldCheck size={18} color={C.accent} />
        <Text style={styles.trustText}>Photos are processed on your phone. Nothing is uploaded and there is no sign-up.</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <Aurora />
      <View style={[styles.header, wide && styles.headerWide]}>
        <Logo size={34} />
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          onPress={toggleMode}
          style={({ pressed }) => [styles.round, pressed && styles.pressed]}
          hitSlop={6}
        >
          {dark ? <Sun size={19} color={C.text2} /> : <Moon size={19} color={C.text2} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => useEditor.setState({ settingsOpen: true })} style={({ pressed }) => [styles.round, pressed && styles.pressed]} hitSlop={6}>
          <Settings size={19} color={C.text2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.inner, wide && styles.innerWide]} showsVerticalScrollIndicator={false}>
        {wide ? (
          <View style={styles.twoCol}>
            <View style={{ flex: 1.15 }}>{hero}</View>
            <View style={{ flex: 1, paddingTop: 4 }}>{rest}</View>
          </View>
        ) : (
          <>
            {hero}
            {rest}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerWide: { paddingHorizontal: 32 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill2, borderWidth: 1, borderColor: C.line },
  inner: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 32, gap: 28 },
  innerWide: { maxWidth: 1080, paddingHorizontal: 32, paddingTop: 8 },
  twoCol: { flexDirection: 'row', gap: 40, alignItems: 'flex-start' },

  hero: { gap: 16 },
  demo: { borderRadius: 24, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2 },
  copy: { gap: 6 },
  title: { color: C.text, fontSize: 30, lineHeight: 35, fontFamily: F.headBold, letterSpacing: -0.9 },
  titleWide: { fontSize: 40, lineHeight: 45, letterSpacing: -1.3 },
  sub: { color: C.text2, fontSize: 15, lineHeight: 22, fontFamily: F.ui },
  cta: {
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
    shadowColor: C.accent,
    shadowOpacity: C.mode === 'dark' ? 0.45 : 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctaText: { color: C.onAccent, fontSize: 17, fontFamily: F.uiBold, letterSpacing: -0.2 },
  perks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', rowGap: 6 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  perkDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: C.text3, marginHorizontal: 10, opacity: 0.6 },
  perkText: { color: C.text3, fontSize: 12.5, fontFamily: F.uiMedium },

  rest: { gap: 12 },
  section: { color: C.text, fontSize: 18, fontFamily: F.head, letterSpacing: -0.3, marginBottom: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexBasis: '46%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  cardIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSoft },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { color: C.text, fontSize: 14.5, fontFamily: F.uiSemi },
  cardText: { color: C.text3, fontSize: 12, lineHeight: 16, fontFamily: F.ui, marginTop: 1 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, padding: 14, borderRadius: 18, backgroundColor: alpha(C.accent, 0.08), borderWidth: 1, borderColor: alpha(C.accent, 0.22) },
  trustText: { flex: 1, color: C.text2, fontSize: 13, lineHeight: 18, fontFamily: F.ui },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
}));
