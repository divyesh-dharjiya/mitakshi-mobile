import { Pressable, Text, View } from 'react-native';
import { CircleAlert, CircleCheck, Info, X } from '@/components/icons';
import { type ToastKind, useToasts } from '@/lib/toast';
import { F, R, makeStyles, useTheme } from '@/theme';

const ICONS = { info: Info, ok: CircleCheck, error: CircleAlert } satisfies Record<ToastKind, typeof Info>;

/** Short messages as glass capsules near the top of the window. */
export function Toaster() {
  const C = useTheme();
  const styles = useStyles();
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  if (!items.length) return null;
  const colors: Record<ToastKind, string> = { info: C.accent, ok: C.ok, error: C.danger };
  return (
    <View style={styles.wrap} pointerEvents="box-none" accessibilityLiveRegion="polite">
      {items.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <View key={t.id} style={styles.toast} accessibilityRole={t.kind === 'error' ? 'alert' : 'text'}>
            <Icon size={17} color={colors[t.kind]} />
            <Text style={styles.text}>{t.text}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => dismiss(t.id)} style={styles.close}>
              <X size={15} color={C.text3} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  wrap: { position: 'absolute', left: 16, right: 16, top: 64, alignItems: 'center', gap: 8, zIndex: 100 },
  toast: {
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: R.pill,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  text: { flexShrink: 1, color: C.text, fontSize: 13, lineHeight: 18, fontFamily: F.uiMedium },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
}));
