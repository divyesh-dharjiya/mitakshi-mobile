/** Diagnostics for test builds: `EXPO_PUBLIC_DEBUG=1 npm run apk` prints them to logcat (tag ReactNativeJS). Off in releases. */
export const DEBUG = process.env.EXPO_PUBLIC_DEBUG === '1';
export const debug = (...args: unknown[]) => {
  if (DEBUG) console.log('[mitakshi]', ...args);
};
