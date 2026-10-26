// Bring your notes: the no-AI sorter. Reads one piece of text and says what it
// is: a song, something to do, a date, money, or a plain idea. It is the part
// that must keep working when no model is configured (CLAUDE.md principle 2),
// so it is deliberately simple and readable rather than clever.

export type ImportKind = 'song' | 'todo' | 'date' | 'money' | 'idea';

export type Classification = {
  /** What the card is labelled. Precedence: song, todo, money, date, idea. */
  kind: ImportKind;
  /** Everything the text also carries, for the counts ("4 dates"). */
  tags: ImportKind[];
  /** Naira amounts found, in naira. */
  amounts: number[];
};

const MONTHS =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

const DATE_PATTERNS = [
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b`, 'i'),
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'i'),
  new RegExp(`\\b(?:${WEEKDAYS})\\b`, 'i'),
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
];

const MONEY_PATTERN =
  /(?:₦|\bNGN\s?|\bN(?=\d))\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)?\b|\b(\d[\d,]*(?:\.\d+)?)\s?(k|m)?\s?naira\b/gi;

const TODO_PATTERN = new RegExp(
  [
    "\\b(?:need to|needs to|have to|has to|must|don'?t forget|do not forget|remember to|make sure|reminder|deadline|should (?:send|call|pay|book|upload|post|finali[sz]e|confirm)|please (?:send|call|pay|book|upload|post|confirm))\\b",
    `\\bby (?:${WEEKDAYS}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS}))\\b`,
  ].join('|'),
  'i'
);
const TODO_VERB_START =
  /^\s*(?:[-*•]\s*)?(?:send|call|pay|book|upload|post|finali[sz]e|confirm|submit|follow up|chase|email|text|shoot|record|mix|master|print|register|pitch|schedule|film|release|design|share)\b/i;

const SONG_MARKER = /^\s*\[?\(?(?:verse|chorus|hook|bridge|intro|outro|pre-chorus)\b/im;

const CHATTER =
  /^\s*(?:ok(?:ay)?|lol|thanks?(?: you)?|thank you|noted|yes|yeah|no|hmm+|good (?:morning|night|evening|afternoon)|amen|alright|sure|cool|nice|done|ha+(?:ha)*|wow|true|exactly|fine|please|sorry|welcome)\W*$/i;

export function extractNairaAmounts(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(MONEY_PATTERN)) {
    const digits = match[1] ?? match[3];
    const suffix = (match[2] ?? match[4] ?? '').toLowerCase();
    if (!digits) continue;
    let value = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    if (suffix === 'k') value *= 1_000;
    if (suffix === 'm') value *= 1_000_000;
    // "₦2" or a stray "N5" is noise, not money worth counting.
    if (value >= 100) amounts.push(Math.round(value));
  }
  return amounts;
}

/** True for lyric-shaped text: several short lines, or a verse/chorus marker. */
export function looksLikeLyrics(text: string): boolean {
  if (SONG_MARKER.test(text)) return true;
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 4) return false;
  if (/https?:\/\//i.test(text) || extractNairaAmounts(text).length > 0) return false;
  const average = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
  const long = lines.filter((line) => line.length > 70).length;
  return average <= 42 && long === 0;
}

function hasDate(text: string): boolean {
  return DATE_PATTERNS.some((pattern) => pattern.test(text));
}

function isNoise(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (CHATTER.test(trimmed)) return true;
  // Emoji, punctuation or a bare link carries nothing to keep.
  if (!/[a-z0-9]/i.test(trimmed)) return true;
  if (/^https?:\/\/\S+$/i.test(trimmed)) return true;
  return false;
}

/**
 * Returns null for chatter and for fragments too short to mean anything on
 * their own, so a 2,000-message chat boils down to what is worth keeping.
 */
export function classifyText(text: string): Classification | null {
  if (isNoise(text)) return null;

  const amounts = extractNairaAmounts(text);
  const tags: ImportKind[] = [];

  const song = looksLikeLyrics(text);
  if (song) tags.push('song');
  if (!song && (TODO_PATTERN.test(text) || TODO_VERB_START.test(text))) tags.push('todo');
  if (amounts.length > 0) tags.push('money');
  if (!song && hasDate(text)) tags.push('date');

  if (tags.length === 0) {
    // A plain thought only survives if it has some substance.
    if (text.trim().length < 25) return null;
    return { kind: 'idea', tags: ['idea'], amounts };
  }

  const order: ImportKind[] = ['song', 'todo', 'money', 'date'];
  const kind = order.find((candidate) => tags.includes(candidate)) ?? 'idea';
  return { kind, tags, amounts };
}
