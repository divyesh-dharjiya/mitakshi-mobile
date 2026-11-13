import { useMemo } from 'react';
import { ImageFormat } from '@shopify/react-native-skia';
import { asPic } from '@/lib/native/pic';

/** A displayable data URI for a small decoded image (face thumbnails are 128 px). */
export function useBitmapUri(bitmap: ImageBitmap | null): string | null {
  return useMemo(() => (bitmap ? `data:image/png;base64,${asPic(bitmap).image.encodeToBase64(ImageFormat.PNG)}` : null), [bitmap]);
}
