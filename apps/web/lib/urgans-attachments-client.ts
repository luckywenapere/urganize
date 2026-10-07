// The browser half of UrgAns attachments: shrink a photo, read a text file.
//
// Kept apart from lib/urgans-attachments.ts because everything here needs a
// canvas or a File, which the shared rules (and their tests) must not. The one
// thing worth knowing: every picture is REDRAWN as a JPEG. That is what makes a
// 6 MB phone shot fit a request, what bakes the camera's rotation in, and what
// turns an iPhone HEIC into something the gateway accepts.

import type { ChappiAttachment } from '@/lib/chappi/types';
import {
  IMAGE_JPEG_QUALITY,
  IMAGE_MAX_EDGE,
  MAX_IMAGE_DATA_URL_CHARS,
  MAX_TEXT_CHARS,
  classifyFile,
} from '@/lib/urgans-attachments';

/** A sentence the person can read. Thrown for anything the composer should show
 * under the box rather than swallow. */
export class AttachmentError extends Error {}

type Drawable = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeImage(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies the camera's rotation, so a portrait shot is not
      // sent on its side.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall through to the element route, which some browsers handle better.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new AttachmentError('That picture could not be opened. Try a JPEG or PNG.');
  }
}

function drawToJpeg(drawable: Drawable, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(drawable.width, drawable.height));
  const width = Math.max(1, Math.round(drawable.width * scale));
  const height = Math.max(1, Math.round(drawable.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new AttachmentError('This browser cannot prepare pictures.');
  // A transparent PNG would turn black in a JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(drawable.source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** The shrunk photo as a data URL, smaller still if the first try is over the
 * size one photo may have. */
async function shrinkImage(file: File): Promise<string> {
  const drawable = await decodeImage(file);
  try {
    const attempts: Array<[number, number]> = [
      [IMAGE_MAX_EDGE, IMAGE_JPEG_QUALITY],
      [1024, 0.7],
      [800, 0.6],
    ];
    for (const [edge, quality] of attempts) {
      const url = drawToJpeg(drawable, edge, quality);
      if (url.length <= MAX_IMAGE_DATA_URL_CHARS) return url;
    }
  } finally {
    drawable.release();
  }
  throw new AttachmentError('That picture is too detailed to send. Try a smaller one.');
}

let counter = 0;
function attachmentId(): string {
  counter += 1;
  return `att-${Date.now().toString(36)}-${counter}`;
}

/** One chosen file, ready to send. Throws AttachmentError with a plain sentence. */
export async function readAttachment(file: File): Promise<ChappiAttachment> {
  const verdict = classifyFile({ name: file.name, type: file.type, size: file.size });
  if (!verdict.ok) throw new AttachmentError(verdict.reason);

  // A phone camera names everything "image.jpg"; a pasted screenshot has no name.
  const name = (file.name || '').trim() || (verdict.kind === 'image' ? 'photo.jpg' : 'file.txt');

  if (verdict.kind === 'image') {
    const dataUrl = await shrinkImage(file);
    return {
      id: attachmentId(),
      kind: 'image',
      name,
      mime: 'image/jpeg',
      size: file.size,
      dataUrl,
    };
  }

  const text = await file.text().catch(() => {
    throw new AttachmentError('That file could not be read.');
  });
  // A binary file renamed .txt shows up as replacement characters.
  if (text.includes('\u0000') || (text.match(/�/g)?.length ?? 0) > 20) {
    throw new AttachmentError('That does not look like a text file.');
  }
  const truncated = text.length > MAX_TEXT_CHARS;
  return {
    id: attachmentId(),
    kind: 'text',
    name,
    mime: file.type || 'text/plain',
    size: file.size,
    text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
    ...(truncated ? { truncated: true } : {}),
  };
}
