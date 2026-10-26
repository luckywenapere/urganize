import { describe, expect, it } from 'vitest';
import {
  BRIDGE_EVENT_TYPES,
  BRIDGE_REQUEST_TYPES,
  SHARE_CHUNK_CHARS,
  parseSharedPayload,
  sliceBase64Chunk,
} from '@urganize/native-bridge';
import { base64ToBytes, maxChunksFor } from './native-share';

describe('sliceBase64Chunk', () => {
  it('walks a file in whole base64 groups and ends with null', () => {
    const base64 = 'A'.repeat(SHARE_CHUNK_CHARS * 2 + 8);
    const first = sliceBase64Chunk(base64, 0);
    expect(first?.data).toHaveLength(SHARE_CHUNK_CHARS);
    expect(first?.next).toBe(SHARE_CHUNK_CHARS);
    const last = sliceBase64Chunk(base64, SHARE_CHUNK_CHARS * 2);
    expect(last?.data).toHaveLength(8);
    expect(last?.next).toBeNull();
  });

  it('refuses an offset that would split a group, go negative or run past the end', () => {
    expect(sliceBase64Chunk('AAAA', 2)).toBeNull();
    expect(sliceBase64Chunk('AAAA', -4)).toBeNull();
    expect(sliceBase64Chunk('AAAA', 8)).toBeNull();
    expect(sliceBase64Chunk('AAAA', 1.5)).toBeNull();
  });

  it('answers an empty file with one empty, final chunk', () => {
    expect(sliceBase64Chunk('', 0)).toEqual({ data: '', next: null });
  });

  it('puts the original bytes back together across chunks', () => {
    const original = new Uint8Array(1000).map((_, i) => i % 251);
    const base64 = Buffer.from(original).toString('base64');
    const parts: number[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const chunk: { data: string; next: number | null } = sliceBase64Chunk(base64, offset)!;
      parts.push(...base64ToBytes(chunk.data));
      offset = chunk.next;
    }
    expect(Uint8Array.from(parts)).toEqual(original);
  });
});

describe('parseSharedPayload', () => {
  const good = { id: '1730000000000-ab12cd', text: 'hi', title: '', files: [{ index: 0, name: 'chat.zip', mimeType: 'application/zip', size: 1200 }] };

  it('reads a well-formed share', () => {
    expect(parseSharedPayload(good)?.files[0]).toEqual({ index: 0, name: 'chat.zip', mimeType: 'application/zip', size: 1200 });
  });

  it('refuses a bad id, too many files or a bad file entry', () => {
    expect(parseSharedPayload({ ...good, id: '../x' })).toBeNull();
    expect(parseSharedPayload({ ...good, id: '' })).toBeNull();
    expect(parseSharedPayload({ ...good, files: Array.from({ length: 9 }, (_, index) => ({ index })) })).toBeNull();
    expect(parseSharedPayload({ ...good, files: [{ index: -1 }] })).toBeNull();
    expect(parseSharedPayload(null)).toBeNull();
  });
});

describe('the bridge advertises the share requests and event', () => {
  it('lists them so an older shell is told "unsupported" instead of timing out', () => {
    expect(BRIDGE_REQUEST_TYPES).toContain('share.readFile');
    expect(BRIDGE_REQUEST_TYPES).toContain('share.done');
    expect(BRIDGE_EVENT_TYPES).toContain('shareReceived');
  });
});

describe('maxChunksFor', () => {
  it('allows enough asks for the stated size and a sane ceiling when it is unknown', () => {
    expect(maxChunksFor(1)).toBeGreaterThanOrEqual(4);
    expect(maxChunksFor(null)).toBeGreaterThan(maxChunksFor(1000));
  });
});
