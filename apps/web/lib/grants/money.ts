// Reading money out of the text of a page.
//
// The grant finder saves an amount only when the page states it, in a currency
// the Opportunities table can hold (NGN, USD, GBP, EUR). Any other currency is
// reported as OTHER with its code so the figure can be written into the notes as
// plain text instead of being guessed into the wrong column. A number with no
// currency next to it is never an amount.
//
// Pure.

export type GrantCurrency = 'NGN' | 'USD' | 'GBP' | 'EUR';
export type FoundAmount = {
  amount: number;
  currency: GrantCurrency | 'OTHER';
  raw: string;
  otherCode?: string;
};

const SAVEABLE = new Set<string>(['NGN', 'USD', 'GBP', 'EUR']);
const OTHER_CODES = new Set(['CAD', 'ZAR', 'AUD', 'GHS', 'KES', 'UGX', 'TZS', 'XOF', 'XAF', 'EGP', 'MAD', 'RWF', 'ETB', 'CHF', 'JPY', 'CNY', 'INR', 'SEK', 'NOK', 'DKK', 'NZD', 'AED']);

const SYMBOLS: Record<string, string> = {
  '₦': 'NGN',
  '$': 'USD',
  'US$': 'USD',
  '£': 'GBP',
  '€': 'EUR',
  'C$': 'CAD',
  'CA$': 'CAD',
  'A$': 'AUD',
  'AU$': 'AUD',
  N: 'NGN',
};

const WORDS: Record<string, string> = { naira: 'NGN', dollar: 'USD', dollars: 'USD', pound: 'GBP', pounds: 'GBP', euro: 'EUR', euros: 'EUR' };
const SCALES: Record<string, number> = { thousand: 1_000, k: 1_000, million: 1_000_000, m: 1_000_000, billion: 1_000_000_000, bn: 1_000_000_000 };

const NUMBER = String.raw`\d(?:[\d.,]*\d)?`;
const SCALE_AFTER = String.raw`(?:\s?(million|billion|thousand)\b|(bn|m|k)\b)?`;

const isAlnum = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9]/.test(ch);

/** `1,234`, `1.234` (exactly three digits after the only separator), `25,000.50`, `2.5`. */
function parseNumber(token: string, scaled: boolean): number | null {
  const seps = [...token.matchAll(/[.,]/g)];
  if (seps.length === 0) return Number(token);

  const last = seps[seps.length - 1];
  const lastIndex = last.index ?? 0;
  const lastSep = last[0];
  const head = token.slice(0, lastIndex);
  const tail = token.slice(lastIndex + 1);
  const kinds = new Set(seps.map((s) => s[0]));

  const groupsOk = (value: string, sep: string): boolean => {
    const groups = value.split(sep);
    return groups.every((g, i) => (i === 0 ? g.length >= 1 && g.length <= 3 : g.length === 3));
  };

  if (kinds.size === 1 && seps.length > 1) {
    if (tail.length !== 3 || !groupsOk(head, lastSep)) return null;
    return Number(token.split(lastSep).join(''));
  }
  if (kinds.size === 2) {
    if (tail.length < 1 || tail.length > 2) return null;
    const thousands = lastSep === '.' ? ',' : '.';
    if (!groupsOk(head, thousands)) return null;
    return Number(`${head.split(thousands).join('')}.${tail}`);
  }
  // One separator, once.
  if (!scaled && tail.length === 3 && head.length >= 1 && head.length <= 3 && head !== '0') return Number(`${head}${tail}`);
  return Number(`${head}.${tail}`);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

type Hit = FoundAmount & { index: number; end: number };

function build(code: string, amount: number, raw: string, index: number, end: number): Hit | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (SAVEABLE.has(code)) return { amount: round(amount), currency: code as GrantCurrency, raw, index, end };
  if (OTHER_CODES.has(code)) return { amount: round(amount), currency: 'OTHER', otherCode: code, raw, index, end };
  return null;
}

function scaleFactor(words: string | undefined, letters: string | undefined): number | undefined {
  const key = (words ?? letters)?.toLowerCase();
  return key ? SCALES[key] : undefined;
}

function scanPrefixed(text: string): Hit[] {
  const hits: Hit[] = [];
  const re = new RegExp(String.raw`(US\$|CA\$|C\$|AU\$|A\$|₦|\$|£|€|[A-Z]{3}|N)\s?(${NUMBER})${SCALE_AFTER}`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const prefix = match[1];
    const reject = (): void => {
      re.lastIndex = start + 1;
    };
    if (isAlnum(text[start - 1])) {
      reject();
      continue;
    }
    const code = /^[A-Z]{3}$/.test(prefix) ? prefix : SYMBOLS[prefix];
    if (!code) {
      reject();
      continue;
    }
    const factor = scaleFactor(match[3], match[4]);
    const parsed = parseNumber(match[2], factor !== undefined);
    if (parsed === null) {
      reject();
      continue;
    }
    const amount = parsed * (factor ?? 1);
    if (prefix === 'N' && !(factor !== undefined || amount >= 1000)) {
      reject();
      continue;
    }
    const hit = build(code, amount, match[0], start, start + match[0].length);
    if (hit) hits.push(hit);
    else reject();
  }
  return hits;
}

function scanSuffixed(text: string): Hit[] {
  const hits: Hit[] = [];
  const codes = [...SAVEABLE, ...OTHER_CODES].join('|');
  const re = new RegExp(String.raw`(${NUMBER})${SCALE_AFTER}\s?(naira|dollars?|pounds?|euros?|${codes})\b`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    if (isAlnum(text[start - 1])) {
      re.lastIndex = start + 1;
      continue;
    }
    const word = match[4];
    const code = WORDS[word.toLowerCase()] ?? (word === word.toUpperCase() ? word : undefined);
    if (!code) continue;
    const factor = scaleFactor(match[2], match[3]);
    const parsed = parseNumber(match[1], factor !== undefined);
    if (parsed === null) continue;
    const hit = build(code, parsed * (factor ?? 1), match[0], start, start + match[0].length);
    if (hit) hits.push(hit);
  }
  return hits;
}

function readHits(text: string): Hit[] {
  if (!text) return [];
  const all = [...scanPrefixed(text), ...scanSuffixed(text)].sort((a, b) => a.index - b.index || b.end - a.end);
  const out: Hit[] = [];
  let lastEnd = -1;
  for (const hit of all) {
    if (hit.index < lastEnd) continue;
    out.push(hit);
    lastEnd = hit.end;
  }
  return out;
}

export function readAmounts(text: string): FoundAmount[] {
  return readHits(text).map(({ index: _index, end: _end, ...found }) => found);
}

// What a figure is for, read from the words around it in its own sentence.
// From the live run (Oct 11, 2026): a model read "a subsidised fee of ₦500,000
// (US$500 diaspora)" and "the total annual budget ... is £3 million" as awards.
// A figure counts as an award unless the words beside it say it is a fee or the
// whole fund, and award words ("up to", "grants of", "between") beat both.
const WINDOW_BEFORE = 80;
const WINDOW_AFTER = 40;
const AWARD_CUE = /\b(up to|grants? of|awards? of|prizes? of|bursar(?:y|ies) of|stipends? of|between|each|per (?:artist|applicant|project|person|recipient|grant|award)|receives?|will get|apply for)\b/i;
const FEE_BEFORE = /\b(fees?|tuition|deposit|costs?|pays?|paid|price|registration|charges?|charged|subscription|tickets?)\b/i;
const POT_BEFORE = /\b(total|budget|pot|overall|counterpart|commitment|invested|has invested)\b/i;
const FEE_AFTER = /^\W*(?:[\w-]+\s+){0,2}(fees?|deposit|registration|entry|tuition)\b/i;
const POT_AFTER = /^\W*(?:[\w-]+\s+){0,2}(funds?|pots?|budgets?|programmes?|programs?|facilit(?:y|ies)|window)\b/i;

function sentenceAround(text: string, index: number, end: number): { before: string; after: string } {
  const from = Math.max(0, index - WINDOW_BEFORE);
  let before = text.slice(from, index);
  const stop = Math.max(before.lastIndexOf('. '), before.lastIndexOf('\n'), before.lastIndexOf('! '), before.lastIndexOf('? '));
  if (stop >= 0) before = before.slice(stop + 1);
  let after = text.slice(end, end + WINDOW_AFTER);
  const cut = after.search(/\.(\s|$)|\n|[!?]\s/);
  if (cut >= 0) after = after.slice(0, cut);
  return { before, after };
}

export type FigureRole = 'award' | 'fee' | 'pot';

/** Whether the words around a figure call it an award, a fee, or the whole fund. */
export function figureRole(text: string, index: number, end: number): FigureRole {
  const { before, after } = sentenceAround(text, index, end);
  if (AWARD_CUE.test(before) || AWARD_CUE.test(after)) return 'award';
  if (FEE_BEFORE.test(before) || FEE_AFTER.test(after)) return 'fee';
  if (POT_BEFORE.test(before) || POT_AFTER.test(after)) return 'pot';
  return 'award';
}

function sameFigure(found: FoundAmount, amount: number, currency: FoundAmount['currency'], otherCode?: string): boolean {
  return found.currency === currency && found.amount === round(amount) && (currency !== 'OTHER' || otherCode === undefined || found.otherCode === otherCode);
}

/** True only when the page text holds this number in this currency. */
export function amountAppearsIn(amount: number, currency: FoundAmount['currency'], text: string, otherCode?: string): boolean {
  return readAmounts(text).some((found) => sameFigure(found, amount, currency, otherCode));
}

/** True only when the page holds this figure at least once where it reads as an award, not a fee or the whole fund. */
export function amountAppearsAsAwardIn(amount: number, currency: FoundAmount['currency'], text: string, otherCode?: string): boolean {
  return readHits(text).some((hit) => sameFigure(hit, amount, currency, otherCode) && figureRole(text, hit.index, hit.end) === 'award');
}

function formatNumber(value: number): string {
  const [whole, fraction] = round(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === '00' ? grouped : `${grouped}.${fraction}`;
}

/** A figure as plain text for the notes, for example `CAD 20,000`. */
export function describeFigure(found: FoundAmount): string {
  const code = found.currency === 'OTHER' ? (found.otherCode ?? 'OTHER') : found.currency;
  return `${code} ${formatNumber(found.amount)}`;
}
