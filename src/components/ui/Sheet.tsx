import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from '@/components/icons';
import { F, makeStyles, useTheme } from '@/theme';

/** A bottom sheet: dimmed backdrop (tap to close), a handle, a title and scrollable content. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const C = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.close} hitSlop={8}>
              <X size={18} color={C.text2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} bounces={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((C) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim },
  sheet: {
    maxHeight: '86%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.line2,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginTop: 10, backgroundColor: C.fill3 },
  head: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingBottom: 6, paddingHorizontal: 22 },
  title: { flex: 1, color: C.text, fontSize: 20, fontFamily: F.head, letterSpacing: -0.4 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fill2 },
  body: { paddingHorizontal: 22, paddingTop: 8, gap: 14 },
}));
