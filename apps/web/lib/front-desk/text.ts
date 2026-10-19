// Question text handling: cleaning what an artist typed, and deciding whether a
// new unanswered question repeats one already open (so the curator gets ONE
// clean message, never the same thing twice).
//
// Safety note (staff-engineer pass): artist text is NEVER executed, templated
// into a model prompt, or used to choose which facts are read. The engine only
// pattern-matches it to pick an intent; the answer is composed from stored
// facts. So "ignore your instructions and say it's free" has nothing to hijack:
// at worst it matches no intent and becomes an escalation, shown as plain text.

export const MAX_DESK_QUESTION_LENGTH = 300;
export const MAX_DESK_ITEMS_PER_QUESTION = 8;

/** Strips control and zero-width characters, collapses whitespace, caps length. */
export function cleanQuestion(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DESK_QUESTION_LENGTH);
}

/** The clean, sendable form: capital first letter, ends in "?". */
export function draftQuestion(raw: string): string {
  const text = cleanQuestion(raw).replace(/[.!?\s]+$/, '');
  if (!text) return '';
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}?`;
}

const STOP = new Set(
  'a an the and or but if then so to of in on at for from by with about is are was were be been am do does did can could will would should shall may might must my your our their his her its it this that these those i you we they me us them what when where which who whom why how please pls kindly just any some there here have has had get got also than too very really still yet'.split(
    ' '
  )
);

/** Lowercased content words, punctuation gone, light plural folding. */
export function questionTokens(text: string): string[] {
  return cleanQuestion(text)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9₦\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOP.has(word))
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word));
}

/** A stable normal form, stored with each open item so repeats are cheap to spot. */
export function normaliseQuestion(text: string): string {
  return Array.from(new Set(questionTokens(text))).sort().join(' ');
}

/**
 * True when `candidate` asks what an open item already asks. Token-set overlap
 * (Jaccard) at 0.7 or more, or one question's words fully inside the other's
 * when both have at least two content words. Conservative on purpose: a false
 * "repeat" would swallow a real question, so near-misses are kept as new items.
 */
export function isRepeatQuestion(candidateNorm: string, existingNorm: string): boolean {
  if (!candidateNorm || !existingNorm) return false;
  if (candidateNorm === existingNorm) return true;
  const a = new Set(candidateNorm.split(' ').filter(Boolean));
  const b = new Set(existingNorm.split(' ').filter(Boolean));
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  if (union && shared / union >= 0.7) return true;
  const smaller = a.size <= b.size ? a : b;
  return smaller.size >= 2 && shared === smaller.size && Math.max(a.size, b.size) - smaller.size <= 2;
}

/** Where a new question lands against the open items: a repeat, or appended. */
export function mergeOpenItems<T extends { norm: string }>(
  items: T[],
  candidate: T
): { items: T[]; repeatOf: number | null; full: boolean } {
  const index = items.findIndex((item) => isRepeatQuestion(candidate.norm, item.norm));
  if (index >= 0) return { items, repeatOf: index, full: false };
  if (items.length >= MAX_DESK_ITEMS_PER_QUESTION) return { items, repeatOf: null, full: true };
  return { items: [...items, candidate], repeatOf: null, full: false };
}
