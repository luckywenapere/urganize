// The rule that makes the grant finder safe to read: a field survives only if the
// PAGE TEXT holds it.
//
// A model reads a page and proposes a funder, a deadline, an amount and some
// eligibility lines. This file checks every one of those against the text it read
// and empties whatever the page does not say. The link and the read date never
// come from the model at all: the link is the page that was fetched and the date
// is the one the caller passes in.
//
// Pure. No network, no clock: the caller passes today in.

import { dateAppearsIn, detectClosedSignal, detectRollingSignal, isCalendarDate } from './dates';
import { amountAppearsIn, describeFigure, type GrantCurrency } from './money';
import type { BlankedField, ExtractedFields, FetchedPage, GrantStatus, VerifiedGrant, VerifyResult } from './types';

export const MAX_ELIGIBILITY_LINES = 5;
export const MAX_ELIGIBILITY_LINE_LENGTH = 200;
export const MIN_ELIGIBILITY_LINE_LENGTH = 8;

const SAVEABLE_CURRENCIES = new Set<string>(['NGN', 'USD', 'GBP', 'EUR']);

const isPresent = (value: unknown): boolean => value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');
const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9_]/.test(ch);
const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** `http` or `https` only, with no fragment and no credentials. Anything else is no link. */
function cleanLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  url.hash = '';
  url.username = '';
  url.password = '';
  return url.toString();
}

function flexiblePattern(claim: string): RegExp | null {
  const words = claim.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const pattern = words
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’‘]/g, "['’‘]"))
    .join('\\s+');
  return new RegExp(pattern, 'gi');
}

/**
 * The page's own wording of a claim, or null if the page does not hold it. Case
 * and spacing do not matter, but a claim must not sit inside a longer word.
 */
function findOnPage(text: string, rawClaim: string): string | null {
  const claim = collapse(rawClaim);
  const re = flexiblePattern(claim);
  if (!re) return null;
  const startsWord = isWordChar(claim[0]);
  const endsWord = isWordChar(claim[claim.length - 1]);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const before = text[match.index - 1];
    const after = text[match.index + match[0].length];
    if ((startsWord && isWordChar(before)) || (endsWord && isWordChar(after))) {
      re.lastIndex = match.index + 1;
      continue;
    }
    return collapse(match[0]);
  }
  return null;
}

function verifyAmount(
  fields: ExtractedFields,
  text: string
): { amount: number | null; currency: GrantCurrency | null; figureNote: string | null; blanked: boolean } {
  const none = { amount: null, currency: null, figureNote: null, blanked: false };
  const claimedAmount = fields.amount;
  if (!isPresent(claimedAmount)) return none;
  const blank = { ...none, blanked: true };
  if (typeof claimedAmount !== 'number' || !Number.isFinite(claimedAmount) || claimedAmount <= 0) return blank;
  const code = typeof fields.currency === 'string' ? fields.currency.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(code)) return blank;

  if (SAVEABLE_CURRENCIES.has(code)) {
    return amountAppearsIn(claimedAmount, code as GrantCurrency, text) ? { amount: claimedAmount, currency: code as GrantCurrency, figureNote: null, blanked: false } : blank;
  }
  // A currency the table cannot hold: keep the figure as text, leave the amount empty.
  if (!amountAppearsIn(claimedAmount, 'OTHER', text, code)) return blank;
  return { amount: null, currency: null, figureNote: describeFigure({ amount: claimedAmount, currency: 'OTHER', otherCode: code, raw: '' }), blanked: false };
}

const HOLDS_A_LINK = /\b(https?:\/\/|www\.)|\b[a-z0-9-]+\.(com|org|net|ng|io|co|africa|gov|edu|info)(\/|\b)/i;

function verifyEligibility(raw: unknown, text: string): { lines: string[]; blanked: boolean } {
  if (!Array.isArray(raw)) return { lines: [], blanked: false };
  const lines: string[] = [];
  const seen = new Set<string>();
  let blanked = false;
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const claim = collapse(item);
    if (claim.length < MIN_ELIGIBILITY_LINE_LENGTH) continue;
    // A grant's only link is the page's own address. A quoted line holding another
    // one is how a page would smuggle a second link in, so it never survives.
    if (HOLDS_A_LINK.test(claim)) {
      blanked = true;
      continue;
    }
    const onPage = findOnPage(text, claim);
    if (!onPage) {
      blanked = true;
      continue;
    }
    if (onPage.length > MAX_ELIGIBILITY_LINE_LENGTH) continue;
    const key = onPage.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (lines.length < MAX_ELIGIBILITY_LINES) lines.push(onPage);
  }
  return { lines, blanked };
}

export type VerifyInput = {
  page: FetchedPage;
  fields: ExtractedFields;
  /** The day the page was read, `YYYY-MM-DD`. */
  readOn: string;
  /** Today, `YYYY-MM-DD`. */
  today: string;
};

export function verifyExtraction({ page, fields, readOn, today }: VerifyInput): VerifyResult {
  const link = cleanLink(page.url);
  if (!link) return { ok: false, reason: 'no_link' };
  const claims: ExtractedFields = fields && typeof fields === 'object' ? fields : {};
  if (claims.isGrant !== true) return { ok: false, reason: 'not_a_grant' };

  const text = typeof page.text === 'string' ? page.text : '';
  const pageTitle = typeof page.title === 'string' ? collapse(page.title) : '';
  const blanked = new Set<BlankedField>();

  // Title: the model's, if the page says it; the page's own title if not.
  const claimedTitle = typeof claims.title === 'string' ? claims.title : '';
  const title = (claimedTitle.trim() ? findOnPage(`${pageTitle}\n${text}`, claimedTitle) : null) ?? pageTitle;
  if (!title) return { ok: false, reason: 'no_title' };

  // Funder.
  let funder: string | null = null;
  if (isPresent(claims.funder)) {
    funder = typeof claims.funder === 'string' ? findOnPage(text, claims.funder) : null;
    if (!funder) blanked.add('funder');
  }

  // Dates and what the page says about whether the round is open.
  const closedSignal = detectClosedSignal(text);
  const rolling = detectRollingSignal(text) && !closedSignal;

  let futureDeadline: string | null = null;
  let pastDeadline: string | null = null;
  if (isPresent(claims.deadline)) {
    const claimed = typeof claims.deadline === 'string' ? claims.deadline.trim() : '';
    if (isCalendarDate(claimed) && dateAppearsIn(claimed, text)) {
      if (claimed < today) pastDeadline = claimed;
      else futureDeadline = claimed;
    } else {
      blanked.add('deadline');
    }
  }

  let claimedClosedOn: string | null = null;
  if (isPresent(claims.lastClosedOn)) {
    const claimed = typeof claims.lastClosedOn === 'string' ? claims.lastClosedOn.trim() : '';
    if (isCalendarDate(claimed) && dateAppearsIn(claimed, text) && claimed <= today) claimedClosedOn = claimed;
    else blanked.add('lastClosedOn');
  }

  // A page that says it is closed, or a deadline that has passed with nothing to
  // say otherwise, is closed. Closed is never offered as open.
  let status: GrantStatus;
  if (closedSignal || (pastDeadline !== null && !rolling)) status = 'closed';
  else if (futureDeadline !== null || rolling) status = 'open';
  else status = 'unknown';

  const deadline = status === 'closed' ? null : futureDeadline;
  const lastClosedOn = status === 'closed' ? (claimedClosedOn ?? pastDeadline) : null;

  // Money.
  const money = verifyAmount(claims, text);
  if (money.blanked) blanked.add('amount');

  // Eligibility.
  const eligibility = verifyEligibility(claims.eligibility, text);
  if (eligibility.blanked) blanked.add('eligibility');

  const grant: VerifiedGrant = {
    title,
    funder,
    link,
    readOn,
    status,
    deadline,
    lastClosedOn,
    rolling,
    amount: money.amount,
    currency: money.currency,
    figureNote: money.figureNote,
    eligibility: eligibility.lines,
    blanked: [...blanked],
  };
  return { ok: true, grant };
}
