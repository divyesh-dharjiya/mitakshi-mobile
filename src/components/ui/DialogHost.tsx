import { Modal, Pressable, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { answer, useDialog } from '@/lib/dialog';
import { F, makeStyles } from '@/theme';

/** The app's yes / no dialog (see `ask`): a centred card on a dimmed screen, in the current theme. */
export function DialogHost() {
  const styles = useStyles();
  const d = useDialog((s) => s.current);
  return (
    <Modal visible={!!d} transparent animationType="fade" onRequestClose={() => answer(false)} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={() => answer(false)} accessibilityRole="button" accessibilityLabel="Cancel" />
        {d && (
          <View style={styles.card} accessibilityViewIsModal>
            <Text style={styles.title}>{d.title}</Text>
            <Text style={styles.message}>{d.message}</Text>
            <View style={styles.row}>
              <Button variant="secondary" style={{ flex: 1 }} onPress={() => answer(false)}>
                Cancel
              </Button>
              <Button variant={d.destructive ? 'danger' : 'primary'} style={{ flex: 1 }} onPress={() => answer(true)}>
                {d.ok}
              </Button>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((C) => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim },
  card: { width: '100%', maxWidth: 360, gap: 10, padding: 22, borderRadius: 26, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2 },
  title: { color: C.text, fontSize: 19, fontFamily: F.head, letterSpacing: -0.3 },
  message: { color: C.text2, fontSize: 14.5, lineHeight: 21, fontFamily: F.ui },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
}));
