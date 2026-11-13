import { useEffect, useState } from 'react';

/**
 * A displayable URI for a decoded bitmap (face thumbnails), released on change or unmount.
 * Thumbnails are 128 px, so encoding them once as PNG is cheap.
 */
export function useBitmapUri(bitmap: ImageBitmap | null): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!bitmap) return setUri(null);
    let alive = true;
    let url: string | null = null;
    (async () => {
      const c = new OffscreenCanvas(bitmap.width, bitmap.height);
      c.getContext('2d')!.drawImage(bitmap, 0, 0);
      const blob = await c.convertToBlob({ type: 'image/png' });
      if (!alive) return;
      url = URL.createObjectURL(blob);
      setUri(url);
    })().catch((e) => console.warn('thumbnail failed', e));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bitmap]);
  return uri;
}
