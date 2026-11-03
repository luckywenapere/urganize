// Photos, camera shots, PDFs, Word and Excel files, and text files for UrgAns.
//
// The person attaches something to a message; a photo goes to the model as an
// image, a text file goes in as text. Nothing is stored: the bytes live in the
// browser for the session and travel with the request, and a SAVED chat keeps
// only the names (lib/chappi/conversation-history.ts builds the saved form from
// id, role and content, so attachments never reach it).
//
// CLIENT-SAFE (no next/server, no node imports): the composer, the transcript,
// the route and the runner share one set of rules, the lib/urgans-voice.ts split.

import type { ChappiAttachment, ChappiMessage } from '@/lib/chappi/types';

const KIB = 1024;
const MIB = 1024 * KIB;

/** Per message. A conversation about one document or a few shots, not an album. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

/** The longest edge a photo is shrunk to before it is sent. Big enough to read a
 * page of print, small enough that four fit in a request. */
export const IMAGE_MAX_EDGE = 1280;
export const IMAGE_JPEG_QUALITY = 0.82;

/** What the picker will accept before shrinking. A phone camera is 3 to 8 MB. */
export const MAX_SOURCE_IMAGE_BYTES = 25 * MIB;

/** One shrunk photo as a data URL. About 820 KB of picture. */
export const MAX_IMAGE_DATA_URL_CHARS = 1_100_000;

/** All photos in one request. Vercel refuses a body over about 4.5 MB, so this
 * keeps the whole message, conversation included, well inside it. */
export const MAX_TOTAL_IMAGE_DATA_CHARS = 3_200_000;

export const MAX_TEXT_FILE_BYTES = 1 * MIB;

/** PDF, Word and Excel files are turned into text in the browser (so the upload
 * limit never applies), then travel as an ordinary text attachment. This is the
 * size of the file itself; the text that comes out is capped by MAX_TEXT_CHARS. */
export const MAX_DOCUMENT_FILE_BYTES = 15 * MIB;
export const MAX_TEXT_CHARS = 40_000;
export const MAX_TOTAL_TEXT_CHARS = 80_000;

/** How far back a photo is still sent with the conversation. A follow-up about a
 * photo works; a chat that mentioned one an hour ago does not carry it forever. */
export const ATTACHMENT_RECENCY_MESSAGES = 4;

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);

// The gateway takes these four. HEIC is decoded and redrawn as JPEG in the
// browser (iPhones hand it over), so it never reaches the server as HEIC.
const DATA_URL_IMAGE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

// A file picker on Windows and some Android browsers reports an empty type for
// .md and .csv, so the extension decides when the type does not.
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'srt', 'vtt']);
const TEXT_MIMES = new Set(['application/json', 'application/csv', 'application/x-ndjson']);

export type DocumentFormat = 'pdf' | 'docx' | 'xlsx';

export type FileVerdict =
  | { ok: true; kind: 'image' | 'text' }
  | { ok: true; kind: 'document'; format: DocumentFormat }
  | { ok: false; reason: string };

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Whether a chosen file can be attached, and as what. The reason is a sentence
 * for the person, not a code. */
export function classifyFile(file: { name: string; type: string; size: number }): FileVerdict {
  const type = (file.type || '').toLowerCase().split(';')[0].trim();
  const ext = extensionOf(file.name);

  let format: DocumentFormat | null = null;
  if (type === 'application/pdf' || ext === 'pdf') format = 'pdf';
  else if (type === DOCX_MIME || ext === 'docx') format = 'docx';
  else if (type === XLSX_MIME || ext === 'xlsx') format = 'xlsx';
  if (format) {
    if (file.size > MAX_DOCUMENT_FILE_BYTES) {
      return { ok: false, reason: 'That file is too big. Pick one under 15 MB, or send the part you need.' };
    }
    return { ok: true, kind: 'document', format };
  }

  if (ext === 'doc' || ext === 'xls' || ext === 'ppt' || ext === 'pptx') {
    return {
      ok: false,
      reason:
        ext === 'doc' || ext === 'xls'
          ? 'AI cannot read the old .doc and .xls files. Save it as .docx or .xlsx and try again.'
          : 'AI cannot read PowerPoint files yet. Save the slides as a PDF and attach that.',
    };
  }

  if (type.startsWith('image/') || IMAGE_MIMES.has(type)) {
    if (!IMAGE_MIMES.has(type)) {
      return { ok: false, reason: 'That picture type is not supported. Use a JPEG, PNG or WebP.' };
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      return { ok: false, reason: 'That picture is too big. Pick one under 25 MB.' };
    }
    return { ok: true, kind: 'image' };
  }

  if (type.startsWith('text/') || TEXT_MIMES.has(type) || TEXT_EXTENSIONS.has(ext)) {
    if (file.size > MAX_TEXT_FILE_BYTES) {
      return { ok: false, reason: 'That file is too long. Pick one under 1 MB, or paste the part you need.' };
    }
    return { ok: true, kind: 'text' };
  }

  return {
    ok: false,
    reason: 'AI can read pictures, PDFs, Word and Excel files, and plain text (text, CSV, JSON, Markdown).',
  };
}

/** The text that stands in for a message sent with no words. Never empty, so the
 * message survives every place that drops a blank one (the route, the saved
 * chat, the title), and a chat reopened later still says what was shared. */
export function attachmentOnlyContent(attachments: ReadonlyArray<Pick<ChappiAttachment, 'name'>>): string {
  const names = attachments.map((a) => a.name).filter(Boolean);
  return names.length > 0 ? `Attached: ${names.join(', ')}` : '';
}

export function isAttachmentOnlyContent(
  content: string,
  attachments: ReadonlyArray<Pick<ChappiAttachment, 'name'>> | undefined
): boolean {
  return Boolean(attachments?.length) && content === attachmentOnlyContent(attachments ?? []);
}

/**
 * Whether one more attachment fits the message being written. The browser runs
 * this so the person is TOLD; the route's parseAttachments applies the same
 * limits and would otherwise drop the extra one without a word. Null means it fits.
 */
export function attachmentFitReason(
  existing: ReadonlyArray<ChappiAttachment>,
  next: ChappiAttachment
): string | null {
  if (existing.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
    return `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} things to one message.`;
  }
  if (next.kind === 'image') {
    const used = existing.reduce((sum, a) => sum + (a.dataUrl?.length ?? 0), 0);
    if (used + (next.dataUrl?.length ?? 0) > MAX_TOTAL_IMAGE_DATA_CHARS) {
      return 'Those pictures are too big to send together. Remove one, or send them in separate messages.';
    }
  } else {
    const used = existing.reduce((sum, a) => sum + (a.text?.length ?? 0), 0);
    if (used + (next.text?.length ?? 0) > MAX_TOTAL_TEXT_CHARS) {
      return 'Those files are too long to send together. Remove one, or send them in separate messages.';
    }
  }
  return null;
}

export function hasAttachmentPayload(a: ChappiAttachment): boolean {
  return a.kind === 'image' ? Boolean(a.dataUrl) : typeof a.text === 'string';
}

/** The same attachments with the bytes taken off. */
function withoutPayload(a: ChappiAttachment): ChappiAttachment {
  const { dataUrl: _dataUrl, text: _text, ...rest } = a;
  return rest;
}

export function stripAttachmentPayloads(messages: ChappiMessage[]): ChappiMessage[] {
  return messages.map((m) => (m.attachments?.length ? { ...m, attachments: m.attachments.map(withoutPayload) } : m));
}

/**
 * What to send with a request: the bytes of the latest message that carries any,
 * and only while it is recent. Everything older keeps its names, so the model
 * knows something was shared, and the request does not carry a photo on every
 * later turn (a real cost on mobile data).
 */
export function selectAttachmentsToSend(messages: ChappiMessage[]): ChappiMessage[] {
  let keep = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].attachments?.some(hasAttachmentPayload)) {
      keep = i;
      break;
    }
  }
  const recent = keep >= 0 && messages.length - keep <= ATTACHMENT_RECENCY_MESSAGES;
  return messages.map((m, index) =>
    m.attachments?.length && !(recent && index === keep)
      ? { ...m, attachments: m.attachments.map(withoutPayload) }
      : m
  );
}

// ── Reading what a request carries ───────────────────────────────────────────

function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw : '';
  // A file name is shown back to the person and written into the prompt, so it
  // loses control characters and line breaks and is capped.
  return name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) || 'attachment';
}

/**
 * The attachments on one incoming message, checked. Shape validation only: the
 * route never trusts what the browser claims. An attachment that fails is
 * dropped (its name stays so the model knows something was there); the limits
 * apply to what is left.
 */
export function parseAttachments(raw: unknown): ChappiAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ChappiAttachment[] = [];
  let imageChars = 0;
  let textChars = 0;

  for (const item of raw.slice(0, MAX_ATTACHMENTS_PER_MESSAGE)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const kind = o.kind;
    if (kind !== 'image' && kind !== 'text') continue;
    const base = {
      id: typeof o.id === 'string' ? o.id.slice(0, 80) : '',
      name: cleanName(o.name),
      mime: typeof o.mime === 'string' ? o.mime.slice(0, 80) : '',
      size: typeof o.size === 'number' && Number.isFinite(o.size) ? Math.max(0, Math.floor(o.size)) : 0,
    };

    if (kind === 'image') {
      const dataUrl = o.dataUrl;
      if (typeof dataUrl !== 'string') {
        out.push({ ...base, kind });
        continue;
      }
      const fits =
        dataUrl.length <= MAX_IMAGE_DATA_URL_CHARS &&
        imageChars + dataUrl.length <= MAX_TOTAL_IMAGE_DATA_CHARS &&
        DATA_URL_IMAGE.test(dataUrl);
      if (!fits) {
        out.push({ ...base, kind });
        continue;
      }
      imageChars += dataUrl.length;
      out.push({ ...base, kind, dataUrl });
      continue;
    }

    const text = o.text;
    if (typeof text !== 'string') {
      out.push({ ...base, kind });
      continue;
    }
    const room = Math.min(MAX_TEXT_CHARS, MAX_TOTAL_TEXT_CHARS - textChars);
    if (room <= 0) {
      out.push({ ...base, kind });
      continue;
    }
    const clipped = text.length > room ? text.slice(0, room) : text;
    textChars += clipped.length;
    out.push({ ...base, kind, text: clipped, ...(clipped.length < text.length || o.truncated === true ? { truncated: true } : {}) });
  }
  return out;
}

// ── What the model reads ─────────────────────────────────────────────────────

export type ModelUserPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'auto' } };

/**
 * The user's turn as the model receives it. Text files go in as a labelled block
 * in the same text part; photos become image parts. An attachment whose bytes
 * are gone (an earlier turn) is a one-line note, so the model neither pretends
 * to have seen it nor says nothing was shared.
 *
 * A plain string when there is nothing but words, which keeps every turn without
 * an attachment byte for byte what it was.
 */
export function buildUserModelContent(
  content: string,
  attachments: ChappiAttachment[] | undefined
): string | ModelUserPart[] {
  if (!attachments || attachments.length === 0) return content;

  const blocks: string[] = [];
  const images: ModelUserPart[] = [];
  const gone: string[] = [];

  for (const a of attachments) {
    if (a.kind === 'text' && typeof a.text === 'string') {
      blocks.push(
        `--- Attached file: ${a.name}${a.truncated ? ' (cut short, the rest was not sent)' : ''} ---\n${a.text}\n--- End of file ---`
      );
    } else if (a.kind === 'image' && a.dataUrl) {
      images.push({ type: 'image_url', image_url: { url: a.dataUrl, detail: 'auto' } });
    } else {
      gone.push(a.name);
    }
  }

  const note = gone.length > 0 ? `(Shared earlier and no longer available to read: ${gone.join(', ')}.)` : '';
  const text = [isAttachmentOnlyContent(content, attachments) ? '' : content, ...blocks, note]
    .filter((part) => part.trim())
    .join('\n\n');

  if (images.length === 0) return text || content;
  return [{ type: 'text', text: text || 'The user attached a picture.' }, ...images];
}

// ── Turning documents into text ──────────────────────────────────────────────

/** One sheet as plain text: a heading, then one line per row, cells separated by
 * a tab. Empty rows are dropped (a spreadsheet is mostly empty space). */
export function formatSheetAsText(name: string, rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const lines: string[] = [];
  for (const row of rows) {
    const cells = row.map((cell) => {
      if (cell === null || cell === undefined) return '';
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return String(cell).replace(/[\t\r\n]+/g, ' ').trim();
    });
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    if (cells.length > 0) lines.push(cells.join('\t'));
  }
  return `## Sheet: ${name}\n${lines.join('\n')}`;
}

/** Page texts as one string, each page under its own heading so the model can say
 * where something was. Pages with no text are left out. */
export function formatPagesAsText(pages: ReadonlyArray<string>): string {
  return pages
    .map((text, index) => ({ page: index + 1, text: text.replace(/[ \t]+\n/g, '\n').trim() }))
    .filter((p) => p.text.length > 0)
    .map((p) => `## Page ${p.page}\n${p.text}`)
    .join('\n\n');
}
