import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Splash } from '@/components/brand/Splash';
import { Studio } from '@/components/studio/Studio';
import { BRAND } from '@/lib/brand';
import * as editor from '@/lib/editor';
import { makeStyles, useThemeMode } from '@/theme';

/* eslint-disable @typescript-eslint/no-require-imports */
// The same four Inter weights as before, cut down to Latin (assets/fonts, 93 KB each instead of 340 KB): the APK stays small.
const INTER = {
  Inter_400Regular: require('./assets/fonts/Inter_400Regular.ttf'),
  Inter_500Medium: require('./assets/fonts/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('./assets/fonts/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('./assets/fonts/Inter_700Bold.ttf'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

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
  const [fontsLoaded] = useFonts(INTER);
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
