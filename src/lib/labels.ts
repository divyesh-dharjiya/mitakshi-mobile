import { Platform } from 'react-native';

/** Wording that differs between the browser (downloads, drag and drop) and the phone (gallery, share sheet). */
const web = Platform.OS === 'web';

export const L = {
  save: web ? 'Download' : 'Save',
  saveFull: web ? 'Download full resolution' : 'Save to gallery',
  saveOne: web ? 'Download this photo' : 'Save this photo',
  zip: web ? 'Download ZIP' : 'Share ZIP',
  addHint: web ? 'or drop several here' : 'from your gallery',
} as const;
