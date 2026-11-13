import { Text, View } from 'react-native';
import { ShieldCheck, Trash2 } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { MODELS, type ModelKey, modelBytes } from '@/lib/ai/registry';
import { BRAND } from '@/lib/brand';
import { confirm } from '@/lib/dialog';
import { deleteEngines, useEditor } from '@/lib/editor';
import { fmtMB } from '@/lib/format';
import { F, alpha, makeStyles, setMode, useTheme } from '@/theme';
import app from '../../../app.json';

const ENGINES = (Object.keys(MODELS) as ModelKey[]).filter((k) => MODELS[k].large);
const close = () => useEditor.setState({ settingsOpen: false });

/** Settings: the AI engines saved on this phone, privacy, and the app version. */
export function SettingsSheet() {
  const C = useTheme();
  const styles = useStyles();
  const open = useEditor((s) => s.settingsOpen);
  const cached = useEditor((s) => s.cached);
  const busy = useEditor((s) => s.busy !== null);
  const saved = ENGINES.filter((k) => cached.includes(k));

  return (
    <Sheet open={open} title="Settings" onClose={close}>
      <Text style={styles.label}>Appearance</Text>
      <Segmented
        label="Appearance"
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
        ]}
        value={C.mode}
        onChange={setMode}
      />
      <Text style={styles.label}>AI engines on this phone</Text>
      <View style={styles.list}>
        {ENGINES.map((k, i) => {
          const has = cached.includes(k);
          return (
            <View key={k} style={[styles.row, i > 0 && styles.rowLine]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{MODELS[k].label}</Text>
                <Text style={styles.size}>{fmtMB(modelBytes(k))}</Text>
              </View>
              <Text style={[styles.state, { color: has ? C.ok : C.text3 }]}>{has ? 'Saved' : 'Downloads when needed'}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.note}>The face detector and the HD upscaler are built into the app. The others download once, the first time you use them.</Text>
      <Button
        variant="danger"
        icon={Trash2}
        block
        disabled={busy || saved.length === 0}
        onPress={async () => {
          if (await confirm('Delete the downloaded AI engines from this phone? They download again the next time you need them.')) void deleteEngines();
        }}
      >
        {saved.length ? `Free up ${fmtMB(saved.reduce((sum, k) => sum + modelBytes(k), 0))}` : 'Nothing downloaded yet'}
      </Button>

      <View style={styles.privacy}>
        <ShieldCheck size={18} color={C.ok} />
        <Text style={styles.privacyText}>
          {BRAND.name} works entirely on your phone. Your photos are never uploaded, and nothing about you is collected.
        </Text>
      </View>
      <Text style={styles.version}>
        {BRAND.name} {app.expo.version}
      </Text>
    </Sheet>
  );
}

const useStyles = makeStyles((C) => ({
  label: { color: C.text2, fontSize: 13, fontFamily: F.uiSemi },
  list: { borderRadius: 16, backgroundColor: C.fill1, borderWidth: 1, borderColor: C.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  rowLine: { borderTopWidth: 1, borderTopColor: C.line },
  name: { color: C.text, fontSize: 14, fontFamily: F.uiSemi },
  size: { color: C.text3, fontSize: 12, fontFamily: F.ui },
  state: { fontSize: 12, fontFamily: F.uiSemi },
  note: { color: C.text3, fontSize: 12.5, lineHeight: 18, fontFamily: F.ui },
  privacy: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, backgroundColor: alpha(C.ok, 0.1), borderWidth: 1, borderColor: alpha(C.ok, 0.28) },
  privacyText: { flex: 1, color: C.text2, fontSize: 13, lineHeight: 19, fontFamily: F.ui },
  version: { color: C.text3, fontSize: 12, fontFamily: F.ui, textAlign: 'center', paddingBottom: 4 },
}));
