// Bring your notes: turns pasted text, a file's text, or a WhatsApp export into
// a reviewable list of items. Pure: the same text and releases always give the
// same list, and nothing here touches the network.

import { MAX_NOTE_BODY_LENGTH } from '@/lib/notes';
import { classifyText, looksLikeLyrics, type ImportKind } from './detect';
import { matchRelease, type MatchableRelease } from './match';
import { isWhatsAppExport, parseWhatsApp, type ChatMessage } from './whatsapp';

export type ImportSource = 'whatsapp' | 'text' | 'photo';

export type ImportItem = {
  id: string;
  kind: ImportKind;
  tags: ImportKind[];
  text: string;
  author: string | null;
  /** When it was written, ISO, or null for pasted text. */
  at: string | null;
  /** The one release it clearly talks about. Null means loose. */
  releaseId: string | null;
  /** Releases it could mean, when more than one title matched. */
  candidateReleaseIds: string[];
  amountsNaira: number[];
  /** A day the note names (YYYY-MM-DD), set by the AI pass. */
  dueOn?: string | null;
  /** True once UrgAns has read this card. */
  aiSorted?: boolean;
};

export type ImportPreview = {
  source: ImportSource;
  items: ImportItem[];
  authors: { name: string; count: number }[];
  messageCount: number;
  mediaSkipped: number;
  /** True when more than MAX_IMPORT_ITEMS were found and the oldest were left out. */
  truncated: boolean;
};

export type ImportCounts = {
  songs: number;
  todos: number;
  dates: number;
  moneyTotalNaira: number;
  total: number;
};

/** Hard ceiling on one import, so one big chat cannot flood a notebook. */
export const MAX_IMPORT_ITEMS = 400;
/** Largest text read in one go (a long chat is a few hundred KB). */
export const MAX_IMPORT_CHARS = 3_000_000;
/** Same-author messages this close together read as one thought. */
const MERGE_WINDOW_MS = 5 * 60_000;

type Block = { text: string; author: string | null; at: string | null };

function mergeMessages(messages: ChatMessage[]): ChatMessage[][] {
  const groups: ChatMessage[][] = [];
  for (const message of messages) {
    const last = groups[groups.length - 1];
    const previous = last?.[last.length - 1];
    const close =
      previous &&
      previous.author === message.author &&
      previous.at &&
      message.at &&
      Math.abs(Date.parse(message.at) - Date.parse(previous.at)) <= MERGE_WINDOW_MS;
    if (last && close) last.push(message);
    else groups.push([message]);
  }
  return groups;
}

function chatBlocks(messages: ChatMessage[]): Block[] {
  const blocks: Block[] = [];
  for (const group of mergeMessages(messages)) {
    const joined = group.map((message) => message.text).join('\n');
    // Lyrics are often typed one line per message. Keep them as one song.
    if (group.length > 1 && looksLikeLyrics(joined)) {
      blocks.push({ text: joined, author: group[0].author, at: group[0].at });
    } else {
      for (const message of group) blocks.push({ text: message.text, author: message.author, at: message.at });
    }
  }
  return blocks;
}

const BULLET = /^\s*(?:[-*•]|\d{1,2}[.)])\s+/;

function plainBlocks(text: string, perLine = false): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n').filter((line) => line.trim());
    // A transcribed photo is often one run of lines with no blank gaps. Lyrics
    // stay together; anything else is read a line at a time.
    if (perLine && lines.length >= 2 && !looksLikeLyrics(trimmed)) {
      for (const line of lines) blocks.push({ text: line.replace(BULLET, '').trim(), author: null, at: null });
      continue;
    }
    // A bullet list is a stack of separate things, not one note.
    if (lines.length >= 2 && lines.every((line) => BULLET.test(line))) {
      for (const line of lines) blocks.push({ text: line.replace(BULLET, '').trim(), author: null, at: null });
    } else {
      blocks.push({ text: trimmed, author: null, at: null });
    }
  }
  return blocks;
}

export function buildImportPreview(
  rawText: string,
  releases: MatchableRelease[],
  from: 'text' | 'photo' = 'text'
): ImportPreview {
  const text = rawText.slice(0, MAX_IMPORT_CHARS);
  const whatsapp = isWhatsAppExport(text);
  const parsed = whatsapp ? parseWhatsApp(text) : null;
  const blocks = parsed ? chatBlocks(parsed.messages) : plainBlocks(text, from === 'photo');

  let items: ImportItem[] = [];
  for (const block of blocks) {
    const classification = classifyText(block.text);
    if (!classification) continue;
    const match = matchRelease(block.text, releases);
    items.push({
      id: '',
      kind: classification.kind,
      tags: classification.tags,
      text: block.text.slice(0, MAX_NOTE_BODY_LENGTH - 200),
      author: block.author,
      at: block.at,
      releaseId: match.kind === 'one' ? match.release.id : null,
      candidateReleaseIds: match.kind === 'many' ? match.candidates.map((release) => release.id) : [],
      amountsNaira: classification.amounts,
    });
  }

  // Newest first, so a very long chat keeps what is recent and drops the oldest.
  if (parsed) items.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const truncated = items.length > MAX_IMPORT_ITEMS;
  if (truncated) items = items.slice(0, MAX_IMPORT_ITEMS);
  items = items.map((item, index) => ({ ...item, id: `i${index}` }));

  return {
    source: parsed ? 'whatsapp' : from,
    items,
    authors: parsed?.authors ?? [],
    messageCount: parsed?.messages.length ?? blocks.length,
    mediaSkipped: parsed?.mediaSkipped ?? 0,
    truncated,
  };
}

export function countImport(items: ImportItem[]): ImportCounts {
  let moneyTotalNaira = 0;
  for (const item of items) for (const amount of item.amountsNaira) moneyTotalNaira += amount;
  return {
    songs: items.filter((item) => item.tags.includes('song')).length,
    todos: items.filter((item) => item.tags.includes('todo')).length,
    dates: items.filter((item) => item.tags.includes('date')).length,
    moneyTotalNaira,
    total: items.length,
  };
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Tobi · WhatsApp · 3 Oct 2025". Pasted text has no author or date to cite. */
export function provenanceLine(item: ImportItem, source: ImportSource): string {
  const parts: string[] = [];
  if (item.author) parts.push(item.author);
  parts.push(source === 'whatsapp' ? 'WhatsApp' : source === 'photo' ? 'Photo' : 'Brought in');
  if (item.at) parts.push(DAY_FORMAT.format(new Date(item.at)));
  if (item.dueOn) parts.push(`Due ${DAY_FORMAT.format(new Date(`${item.dueOn}T00:00:00Z`))}`);
  return parts.join(' · ');
}

/** The note as it will be stored. The first line is the title, so the text leads. */
export function noteBodyFor(item: ImportItem, source: ImportSource): string {
  const line = provenanceLine(item, source);
  const body = `${item.text.trim()}\n\n${line}`;
  return body.length > MAX_NOTE_BODY_LENGTH ? body.slice(0, MAX_NOTE_BODY_LENGTH) : body;
}
