import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BatchModal } from '@/components/batch/BatchModal';
import { EditorScreen } from '@/components/editor/EditorScreen';
import { ProcessingOverlay } from '@/components/editor/ProcessingOverlay';
import { SaveSheet } from '@/components/editor/SaveSheet';
import { HomeScreen } from '@/components/home/HomeScreen';
import { SettingsSheet } from '@/components/home/SettingsSheet';
import { DialogHost } from '@/components/ui/DialogHost';
import { Toaster } from '@/components/ui/Toaster';
import { useGlobalEvents } from '@/hooks/useGlobalEvents';
import { initEngine, useEditor } from '@/lib/editor';
import { F, makeStyles } from '@/theme';

/**
 * The whole application. The editor stays mounted all the time (it owns the photo canvas, which the
 * browser build needs before the first photo opens), and the home screen covers it until a photo
 * is open. The progress overlay, sheets and toasts sit above both.
 */
export function Studio() {
  const styles = useStyles();
  useGlobalEvents();
  useEffect(() => {
    void initEngine();
  }, []);
  const hasPhoto = useEditor((s) => s.work !== null);
  const dragging = useEditor((s) => s.dragging);

  return (
    <View style={styles.app}>
      <EditorScreen />
      {!hasPhoto && (
        <View style={StyleSheet.absoluteFill}>
          <HomeScreen />
        </View>
      )}
      <ProcessingOverlay />
      {dragging && (
        <View style={styles.drop} pointerEvents="none">
          <Text style={styles.dropText}>Drop to enhance</Text>
        </View>
      )}
      <SaveSheet />
      <SettingsSheet />
      <BatchModal />
      <DialogHost />
      <Toaster />
    </View>
  );
}

const useStyles = makeStyles((C) => ({
  app: { flex: 1, backgroundColor: C.bg },
  drop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: C.scrim, borderWidth: 2, borderStyle: 'dashed', borderColor: C.accentLine },
  dropText: { color: C.text, fontSize: 22, fontFamily: F.head },
}));
