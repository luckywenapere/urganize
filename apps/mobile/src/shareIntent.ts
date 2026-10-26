// Android share sheet: Urganize as a place to send a WhatsApp chat export, a
// voice note, a photo or some text (Bring your notes). expo-share-intent
// catches the Android SEND intent; this file holds what arrived and hands it to
// the page piece by piece, because a chat export can be several MB.
//
// The flow, every step ending at the website's NativeShareBridge:
//   1. A share arrives. registerShare() keeps its file list and returns the
//      `shareReceived` event for App.tsx to emit (held until the page is ready).
//   2. The page asks `share.readFile` for each file, a chunk at a time
//      (readSharedChunk). The file is read from disk once, on the first ask.
//   3. The page says `share.done` (finishShare) and the shell lets go.
// Nothing is uploaded by the shell. The page decides what happens next.

import * as LegacyFileSystem from 'expo-file-system/legacy';
import {
  sliceBase64Chunk,
  type BridgeRequestMap,
  type SharedPayload,
} from '@urganize/native-bridge';

type HeldFile = { uri: string; base64: string | null };
type HeldShare = { files: HeldFile[]; at: number };

// Shares nobody finished (the page was reloaded mid-way) are dropped after this.
const HOLD_MS = 15 * 60_000;
const held = new Map<string, HeldShare>();

type IncomingFile = { path: string; fileName: string; mimeType: string; size: number | null };
export type IncomingShare = {
  text: string | null;
  title: string | null;
  files: IncomingFile[] | null;
};

function sweep(now: number) {
  for (const [id, share] of held) if (now - share.at > HOLD_MS) held.delete(id);
}

function newId(now: number): string {
  return `${now}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The URI a file can be read from: expo-share-intent gives file:// or content:// paths, sometimes bare. */
function readableUri(path: string): string {
  return path.startsWith('/') ? `file://${path}` : path;
}

/**
 * Keeps an incoming share and returns the event the page is told about. Null
 * when there is nothing in it (an empty share is not worth waking the page).
 */
export function registerShare(incoming: IncomingShare, now: number = Date.now()): SharedPayload | null {
  sweep(now);
  const files = (incoming.files ?? []).filter((file) => file.path).slice(0, 8);
  const text = (incoming.text ?? '').trim();
  if (files.length === 0 && !text) return null;

  const id = newId(now);
  held.set(id, { files: files.map((file) => ({ uri: readableUri(file.path), base64: null })), at: now });
  return {
    id,
    text,
    title: (incoming.title ?? '').trim(),
    files: files.map((file, index) => ({
      index,
      name: file.fileName || 'file',
      mimeType: file.mimeType || '',
      size: file.size,
    })),
  };
}

export async function readSharedChunk(
  payload: BridgeRequestMap['share.readFile']['payload']
): Promise<BridgeRequestMap['share.readFile']['result']> {
  const share = held.get(payload.id);
  const file = share?.files[payload.index];
  if (!share || !file) throw new Error('That share is no longer here. Share it again.');
  if (file.base64 === null) {
    file.base64 = await LegacyFileSystem.readAsStringAsync(file.uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
  }
  const chunk = sliceBase64Chunk(file.base64, payload.offset);
  if (!chunk) throw new Error('That part of the file could not be read.');
  // The last chunk of a file frees its copy, so a six-file share never holds six at once.
  if (chunk.next === null) file.base64 = '';
  return chunk;
}

export function finishShare(id: string): void {
  held.delete(id);
}
