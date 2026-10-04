/**
 * A minimal zip writer: stored (uncompressed) entries only.
 *
 * Photos and audio are already compressed, so deflate would cost time for
 * almost no size, and storing needs no dependency (the data export declined an
 * archiver for the same reason). Pure and import free so it can run in the
 * browser and under vitest alike.
 *
 * Limits are the classic zip ones: 65,535 entries and 4 GiB. A press kit is a
 * handful of files, so nothing here approaches either; the writer throws
 * rather than writing a corrupt archive if one is ever hit.
 */

export type ZipEntry = { name: string; data: Uint8Array; modified?: Date };

const MAX_ENTRIES = 0xffff;
const MAX_BYTES = 0xffffffff;

let crcTable: Uint32Array | null = null;

function table(): Uint32Array {
  if (crcTable) return crcTable;
  const built = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    built[n] = c >>> 0;
  }
  crcTable = built;
  return built;
}

export function crc32(data: Uint8Array): number {
  const t = table();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = t[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** A name that is safe inside an archive: no folders, no traversal, no control
 *  characters, never empty. Collisions are handled by the caller. */
export function safeZipName(name: string, fallback = 'file'): string {
  const cleaned = String(name || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/** Makes every name in the list unique by numbering the repeats, keeping the
 *  extension: a.jpg, a.jpg becomes a.jpg, a-2.jpg. Case-insensitive, because
 *  the people opening the archive are on Windows and macOS. */
export function uniqueZipNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((raw) => {
    const name = safeZipName(raw);
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    // Keep numbering until the name is genuinely free, so a file already
    // called a-2.jpg cannot collide with the second a.jpg.
    for (let count = 2; taken.has(candidate.toLowerCase()); count += 1) {
      candidate = `${base}-${count}${ext}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

export function createZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length > MAX_ENTRIES) throw new Error('Too many files for one zip.');
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const { time, day } = dosDateTime(entry.modified || new Date());
    const size = entry.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // names are UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, 0x0800, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, time, true);
    header.setUint16(14, day, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, size, true);
    header.setUint32(24, size, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true);

    parts.push(new Uint8Array(local.buffer), name, entry.data);
    central.push(new Uint8Array(header.buffer), name);
    offset += 30 + name.length + size;
    if (offset > MAX_BYTES) throw new Error('Too much data for one zip.');
  }

  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((total, part) => total + part.length, 0));
  let cursor = 0;
  for (const part of all) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}
