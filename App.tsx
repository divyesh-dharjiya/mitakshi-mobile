import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
// Per-weight imports, so the build only ships the four font files the app uses.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Splash } from '@/components/brand/Splash';
import { Studio } from '@/components/studio/Studio';
import { BRAND } from '@/lib/brand';
import * as editor from '@/lib/editor';
import { makeStyles, useThemeMode } from '@/theme';

// Development only: lets the browser console drive the editor (for example `__editor.loadPhoto(blob, 'a.jpg')`).
if (__DEV__ && Platform.OS === 'web') (globalThis as { __editor?: typeof editor }).__editor = editor;

// Keep the system splash up until the animated one is on screen, so there is no flash in between.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Installable, offline-capable web app: the manifest always, the service worker in production only. */
function useServiceWorker() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.webmanifest';
      document.head.append(link);
    }
    if (__DEV__ || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('service worker', e));
  }, []);
}

export default function App() {
  const styles = useStyles();
  const mode = useThemeMode((s) => s.mode);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [splash, setSplash] = useState(true);
  useServiceWorker();
  useEffect(() => {
    if (Platform.OS === 'web') document.title = `${BRAND.name} · ${BRAND.tagline}`;
  }, []);
  const hideSplash = useCallback(() => setSplash(false), []);
  // The animated splash starts on the first frame; the system splash can go as soon as it is drawn.
  const onLayout = useCallback(() => void SplashScreen.hideAsync().catch(() => {}), []);

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onLayout}>
      <SafeAreaProvider>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
          {fontsLoaded && <Studio />}
        </SafeAreaView>
        {splash && <Splash ready={fontsLoaded} onDone={hideSplash} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const useStyles = makeStyles((C) => ({
  root: { flex: 1, backgroundColor: C.bg },
}));
