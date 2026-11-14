import { Text, View } from 'react-native';
import { ShieldCheck } from '@/components/icons';
import { Segmented } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { BRAND } from '@/lib/brand';
import { useEditor } from '@/lib/editor';
import { F, alpha, makeStyles, setMode, useTheme } from '@/theme';
import app from '../../../app.json';

const close = () => useEditor.setState({ settingsOpen: false });

/** Settings: appearance, privacy, and the app version. */
export function SettingsSheet() {
  const C = useTheme();
  const styles = useStyles();
  const open = useEditor((s) => s.settingsOpen);

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
  privacy: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, backgroundColor: alpha(C.ok, 0.1), borderWidth: 1, borderColor: alpha(C.ok, 0.28) },
  privacyText: { flex: 1, color: C.text2, fontSize: 13, lineHeight: 19, fontFamily: F.ui },
  version: { color: C.text3, fontSize: 12, fontFamily: F.ui, textAlign: 'center', paddingBottom: 4 },
}));
