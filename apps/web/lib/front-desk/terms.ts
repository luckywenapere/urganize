// Reading and validating a curator's terms (screen 12). Pure.
//
// Everything that comes in from the client or the database goes through
// parseDeskTerms, which keeps only known fields, trims, caps every length and
// count, and drops anything malformed. So a hand-made request can never store a
// shape the answer engine does not expect.

import type { DeskRule, DeskService, DeskTerms } from './types';

export const DESK_LIMITS = {
  services: 8,
  serviceName: 60,
  serviceSummary: 120,
  includes: 6,
  include: 60,
  rate: 100_000_000,
  send: 10,
  sendItem: 40,
  genres: 12,
  genre: 30,
  rules: 20,
  rule: 160,
  phrase: 30,
  days: 365,
} as const;

export const EMPTY_DESK_TERMS: DeskTerms = {
  services: [],
  timing: { repliesWithinDays: null, bookAheadDays: null, startsOn: null, runsFor: null },
  send: [],
  genres: [],
  rules: [],
};

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const id = (value: unknown, fallback: string): string => {
  const raw = text(value, 40);
  return /^[a-zA-Z0-9_-]{1,40}$/.test(raw) ? raw : fallback;
};

const wholeNumber = (value: unknown, max: number): number | null => {
  const n = typeof value === 'string' && value.trim() ? Number(value.replace(/[,₦\s]/g, '')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n);
};

const list = (value: unknown, maxItems: number, maxLength: number): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const clean = text(item, maxLength);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
};

export function parseDeskTerms(input: unknown): DeskTerms {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const servicesRaw = Array.isArray(record.services) ? record.services : [];
  const services: DeskService[] = [];
  servicesRaw.slice(0, DESK_LIMITS.services).forEach((raw, index) => {
    const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const name = text(row.name, DESK_LIMITS.serviceName);
    if (!name) return;
    services.push({
      id: id(row.id, `svc-${index + 1}`),
      name,
      summary: text(row.summary, DESK_LIMITS.serviceSummary),
      includes: list(row.includes, DESK_LIMITS.includes, DESK_LIMITS.include),
      rateNaira: wholeNumber(row.rateNaira, DESK_LIMITS.rate),
    });
  });

  const timingRaw = record.timing && typeof record.timing === 'object' ? (record.timing as Record<string, unknown>) : {};
  const rulesRaw = Array.isArray(record.rules) ? record.rules : [];
  const rules: DeskRule[] = [];
  const seenRules = new Set<string>();
  rulesRaw.slice(0, DESK_LIMITS.rules).forEach((raw, index) => {
    const row = (raw && typeof raw === 'object' ? raw : { text: raw }) as Record<string, unknown>;
    const ruleText = text(row.text, DESK_LIMITS.rule);
    if (!ruleText || seenRules.has(ruleText.toLowerCase())) return;
    seenRules.add(ruleText.toLowerCase());
    const addedAt = text(row.addedAt, 40);
    rules.push({
      id: id(row.id, `rule-${index + 1}`),
      text: ruleText,
      learned: row.learned === true,
      addedAt: addedAt && !Number.isNaN(Date.parse(addedAt)) ? addedAt : null,
    });
  });

  return {
    services,
    timing: {
      repliesWithinDays: wholeNumber(timingRaw.repliesWithinDays, DESK_LIMITS.days),
      bookAheadDays: wholeNumber(timingRaw.bookAheadDays, DESK_LIMITS.days),
      startsOn: text(timingRaw.startsOn, DESK_LIMITS.phrase) || null,
      runsFor: text(timingRaw.runsFor, DESK_LIMITS.phrase) || null,
    },
    send: list(record.send, DESK_LIMITS.send, DESK_LIMITS.sendItem),
    genres: list(record.genres, DESK_LIMITS.genres, DESK_LIMITS.genre),
    rules,
  };
}

/** The toggle can only be on when there is something to answer from (screen 12 empty state). */
export function hasDeskFacts(terms: DeskTerms): boolean {
  return terms.services.length > 0;
}

/** True when the front desk actually answers: switched on AND has facts. */
export function isDeskLive(enabled: boolean, terms: DeskTerms): boolean {
  return enabled && hasDeskFacts(terms);
}

/**
 * The rule UrgAns proposes after a curator answers an escalated question. It is
 * the curator's own words, tidied (one sentence, capital, full stop) and never
 * paraphrased, so the loop cannot put words in their mouth. They can edit it
 * before the one tap; nothing is added without that tap (decision 4).
 */
export function proposeRuleFromAnswer(answer: string): string {
  const clean = text(answer, DESK_LIMITS.rule).replace(/^(no|yes|sorry|hi|hello|hey)[,.!]?\s+/i, '');
  if (!clean) return '';
  const sentence = clean.charAt(0).toUpperCase() + clean.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/** Adds a learned rule (one tap). Returns the same terms if it is already there. */
export function addLearnedRule(terms: DeskTerms, ruleText: string, now: string): DeskTerms {
  const clean = text(ruleText, DESK_LIMITS.rule);
  if (!clean) return terms;
  if (terms.rules.some((rule) => rule.text.toLowerCase() === clean.toLowerCase())) return terms;
  if (terms.rules.length >= DESK_LIMITS.rules) return terms;
  const idSuffix = Date.parse(now).toString(36);
  return { ...terms, rules: [...terms.rules, { id: `learned-${idSuffix}`, text: clean, learned: true, addedAt: now }] };
}
