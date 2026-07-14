/**
 * Compress a photo before storage/analysis: downscale to a bounded edge and
 * re-encode as JPEG, stepping quality (then dimensions) down until it fits the
 * size cap so IndexedDB doesn't balloon and API payloads stay small.
 */

const MAX_EDGE_PX = 1024;
const MIN_EDGE_PX = 480;
const MAX_BYTES = 400 * 1024; // ~400KB of base64 data URL

export interface CompressedImage {
  /** data:image/jpeg;base64,... — for <img> display and storage. */
  dataUrl: string;
  /** Raw base64 (no data: prefix) — for the AI API image block. */
  base64: string;
  mediaType: 'image/jpeg';
}

export async function compressImage(file: Blob): Promise<CompressedImage> {
  // Decode via <img> rather than createImageBitmap: iOS 15–16 Safari ignores
  // EXIF orientation in createImageBitmap (portrait photos come out rotated),
  // while <img> decoding is EXIF-correct everywhere.
  const img = await loadImage(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  let edge = Math.min(MAX_EDGE_PX, Math.max(srcW, srcH));
  let dataUrl = '';

  // Try quality steps at the current size; if even the lowest quality is over
  // the cap, shrink dimensions and try again down to a floor.
  for (;;) {
    const scale = edge / Math.max(srcW, srcH);
    const w = Math.max(1, Math.round(srcW * Math.min(1, scale)));
    const h = Math.max(1, Math.round(srcH * Math.min(1, scale)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0, w, h);

    for (const quality of [0.78, 0.6, 0.42]) {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_BYTES) break;
    }
    if (dataUrl.length <= MAX_BYTES || edge <= MIN_EDGE_PX) break;
    edge = Math.max(MIN_EDGE_PX, Math.round(edge * 0.7));
  }

  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return { dataUrl, base64, mediaType: 'image/jpeg' };
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
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
