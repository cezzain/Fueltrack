/**
 * Compress a photo before storage/analysis: downscale to a bounded edge and
 * re-encode as JPEG, stepping quality down until it fits the size cap so
 * IndexedDB doesn't balloon and API payloads stay small.
 */

const MAX_EDGE_PX = 1024;
const MAX_BYTES = 400 * 1024; // ~400KB of base64 data URL

export interface CompressedImage {
  /** data:image/jpeg;base64,... — for <img> display and storage. */
  dataUrl: string;
  /** Raw base64 (no data: prefix) — for the Anthropic API image block. */
  base64: string;
  mediaType: 'image/jpeg';
}

export async function compressImage(file: Blob): Promise<CompressedImage> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap) bitmap.close();

  let dataUrl = '';
  for (const quality of [0.78, 0.65, 0.5, 0.35]) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_BYTES) break;
  }

  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return { dataUrl, base64, mediaType: 'image/jpeg' };
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap honors EXIF orientation in modern browsers (incl. iOS 15+ Safari).
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img> decode
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
