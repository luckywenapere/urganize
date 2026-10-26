// Bring your notes: turns a chosen file into text, in the browser. The file
// itself never leaves the device. Text, Markdown, Word and a WhatsApp zip.

import { MAX_IMPORT_CHARS } from './build';

export const MAX_IMPORT_FILE_BYTES = 12 * 1024 * 1024;
export const IMPORT_FILE_ACCEPT = '.txt,.md,.docx,.zip,text/plain,text/markdown';

export type ReadFileResult = { ok: true; text: string } | { ok: false; error: string };

const fail = (error: string): ReadFileResult => ({ ok: false, error });

export async function readImportFile(file: File): Promise<ReadFileResult> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return fail('That file is too big. Export the chat without media and try again.');
  }
  const name = file.name.toLowerCase();

  try {
    if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return value.trim() ? { ok: true, text: value.slice(0, MAX_IMPORT_CHARS) } : fail('That document has no text in it.');
    }

    if (name.endsWith('.zip')) {
      const { unzipSync, strFromU8 } = await import('fflate');
      // Only the chat text is opened. Photos and voice notes in the zip are
      // skipped before they are decompressed, so a big export stays cheap.
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: (entry) => entry.name.toLowerCase().endsWith('.txt') && entry.originalSize <= MAX_IMPORT_FILE_BYTES,
      });
      const chat = Object.entries(entries).find(([entryName]) => /chat/i.test(entryName)) ?? Object.entries(entries)[0];
      if (!chat) return fail('No chat text was found in that zip. Export the chat again.');
      return { ok: true, text: strFromU8(chat[1]).slice(0, MAX_IMPORT_CHARS) };
    }

    const text = await file.text();
    return text.trim() ? { ok: true, text: text.slice(0, MAX_IMPORT_CHARS) } : fail('That file is empty.');
  } catch {
    return fail('Could not read that file. Try pasting the text instead.');
  }
}
