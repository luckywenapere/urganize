// Bring your notes: WhatsApp "Export chat" reader. Pure, no IO. The raw chat
// is read in the browser and never sent anywhere; only the notes the person
// keeps are posted (see app/api/notes/import/commit).
//
// Two header shapes exist in the wild:
//   Android:  12/08/2025, 14:32 - Tobi: Send the master
//   iPhone:   [12/08/2025, 14:32:05] Tobi: Send the master
// Day-first versus month-first depends on the phone's region, so it is
// detected from the whole file and defaults to day-first (Nigeria).

export type ChatMessage = {
  /** ISO time, or null when the header could not be read as a date. */
  at: string | null;
  author: string;
  text: string;
};

export type ParsedChat = {
  messages: ChatMessage[];
  /** Photos, stickers, voice notes and deleted messages that carry no text. */
  mediaSkipped: number;
  authors: { name: string; count: number }[];
};

const ANDROID_HEADER =
  /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?\s+-\s+(.*)$/i;
const IOS_HEADER =
  /^\[(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?\]\s+(.*)$/i;

// Invisible direction marks WhatsApp puts in front of lines.
const INVISIBLE = /[‎‏‪-‮﻿]/g;

const MEDIA_ONLY =
  /^(<media omitted>|<attached: .*>|(image|video|audio|sticker|gif|document|contact card|voice message|ptt) omitted|this message was deleted|you deleted this message|null)$/i;

function matchHeader(line: string): RegExpMatchArray | null {
  return line.match(ANDROID_HEADER) || line.match(IOS_HEADER);
}

/** True when the text looks like a WhatsApp export: several header lines near the top. */
export function isWhatsAppExport(text: string): boolean {
  const lines = text.replace(INVISIBLE, '').split(/\r?\n/).slice(0, 60);
  let hits = 0;
  for (const line of lines) {
    if (matchHeader(line.trim())) hits += 1;
    if (hits >= 3) return true;
  }
  return false;
}

function detectDayFirst(headers: RegExpMatchArray[]): boolean {
  let first = 0;
  let second = 0;
  for (const h of headers) {
    if (Number(h[1]) > 12) first += 1;
    if (Number(h[2]) > 12) second += 1;
  }
  if (first > 0 && second === 0) return true;
  if (second > 0 && first === 0) return false;
  return true;
}

function toIso(h: RegExpMatchArray, dayFirst: boolean): string | null {
  const a = Number(h[1]);
  const b = Number(h[2]);
  let year = Number(h[3]);
  if (year < 100) year += 2000;
  const day = dayFirst ? a : b;
  const month = dayFirst ? b : a;
  let hour = Number(h[4]);
  const minute = Number(h[5]);
  const meridiem = (h[6] || '').toLowerCase().replace(/\./g, '');
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseWhatsApp(raw: string): ParsedChat {
  const lines = raw.replace(INVISIBLE, '').split(/\r?\n/);
  const headers = lines
    .map((line) => matchHeader(line.trim()))
    .filter((match): match is RegExpMatchArray => match !== null);
  const dayFirst = detectDayFirst(headers);

  const messages: ChatMessage[] = [];
  let current: ChatMessage | null = null;
  let mediaSkipped = 0;

  const flush = () => {
    if (!current) return;
    const text = current.text.trim();
    if (MEDIA_ONLY.test(text)) {
      mediaSkipped += 1;
    } else if (text) {
      messages.push({ ...current, text });
    }
    current = null;
  };

  for (const line of lines) {
    const header = matchHeader(line.trim());
    if (header) {
      flush();
      const rest = header[7];
      const colon = rest.indexOf(': ');
      // No "Name: " means a system line ("Messages are end-to-end encrypted",
      // "Tobi added Kemi"). It ends the previous message and carries no text.
      if (colon <= 0) {
        current = null;
        continue;
      }
      current = {
        at: toIso(header, dayFirst),
        author: rest.slice(0, colon).trim(),
        text: rest.slice(colon + 2),
      };
    } else if (current) {
      current.text += `\n${line}`;
    }
  }
  flush();

  const counts = new Map<string, number>();
  for (const message of messages) counts.set(message.author, (counts.get(message.author) || 0) + 1);
  const authors = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { messages, mediaSkipped, authors };
}
