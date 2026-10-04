import { describe, expect, it } from 'vitest';
import { createZip, crc32, safeZipName, uniqueZipNames } from './zip-store';

const text = (value: string) => new TextEncoder().encode(value);

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('createZip', () => {
  const zip = createZip([
    { name: 'a.txt', data: text('hello'), modified: new Date(2026, 9, 4, 12, 0, 0) },
    { name: 'é.txt', data: text('world') },
  ]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  it('starts with a local header and ends with the end record', () => {
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(2);
  });

  it('points the end record at the central directory', () => {
    const dirOffset = view.getUint32(zip.length - 22 + 16, true);
    expect(view.getUint32(dirOffset, true)).toBe(0x02014b50);
  });

  it('stores the bytes untouched, with their checksum and a utf-8 flag', () => {
    expect(new TextDecoder().decode(zip.slice(30 + 5, 30 + 5 + 5))).toBe('hello');
    expect(view.getUint32(14, true)).toBe(crc32(text('hello')));
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
  });

  it('makes an empty archive that is still valid', () => {
    const empty = createZip([]);
    expect(empty.length).toBe(22);
  });
});

describe('names', () => {
  it('removes folders, traversal and control characters', () => {
    expect(safeZipName('../../etc/passwd')).not.toContain('/');
    expect(safeZipName('..hidden')).toBe('hidden');
    expect(safeZipName('a\u0000b.jpg')).toBe('ab.jpg');
    expect(safeZipName('   ')).toBe('file');
    expect(safeZipName('')).toBe('file');
  });

  it('numbers repeats and keeps the extension', () => {
    expect(uniqueZipNames(['a.jpg', 'A.JPG', 'a.jpg', 'b'])).toEqual([
      'a.jpg',
      'A-2.JPG',
      'a-3.jpg',
      'b',
    ]);
  });
});
