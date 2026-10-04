// Opportunities (2026-10-04): what a team can go after next, entered by hand and
// moved along from first message to signed. This file is the rules: the words,
// the validation, and how the list is sorted and filtered. The reads and writes
// are in lib/opportunities-server.ts.
//
// Sparse edits follow the rule the credits and relationships routes learned the
// hard way: ABSENT means "leave it alone" and an explicit null means "clear it".

export const OPPORTUNITY_KINDS = ['deal', 'grant', 'sync', 'brand', 'partnership', 'other'] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const OPPORTUNITY_STATUSES = [
  'idea',
  'reaching_out',
  'talking',
  'negotiating',
  'won',
  'lost',
  'passed',
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR'] as const;
export type OpportunityCurrency = (typeof OPPORTUNITY_CURRENCIES)[number];

export const KIND_LABEL: Record<OpportunityKind, string> = {
  deal: 'Deal',
  grant: 'Grant',
  sync: 'Sync',
  brand: 'Brand',
  partnership: 'Partnership',
  other: 'Other',
};

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  idea: 'Idea',
  reaching_out: 'Reaching out',
  talking: 'Talking',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
  passed: 'Passed',
};

/** Won, lost and passed are finished. Everything else is still in play. */
export const CLOSED_STATUSES: readonly OpportunityStatus[] = ['won', 'lost', 'passed'];

export function isClosed(status: OpportunityStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

export const MAX_TITLE = 120;
export const MAX_COUNTERPARTY = 120;
export const MAX_NEXT_STEP = 200;
export const MAX_NOTES = 4000;

export type OpportunityFields = {
  title: string;
  kind: OpportunityKind;
  status: OpportunityStatus;
  counterparty: string;
  amount: number | null;
  currency: OpportunityCurrency;
  nextStep: string;
  nextStepOn: string | null;
  deadlineOn: string | null;
  notes: string;
  artistId: string | null;
  releaseId: string | null;
};

export type OpportunityCreate = OpportunityFields;
export type OpportunityPatch = Partial<OpportunityFields>;

type Parsed<T> = { error: string } | { value: T };

const record = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

function parseTitle(raw: unknown): Parsed<string> {
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'Add a title.' };
  const value = raw.trim();
  if (value.length > MAX_TITLE) return { error: `Keep the title under ${MAX_TITLE} characters.` };
  return { value };
}

function parseText(raw: unknown, max: number, what: string): Parsed<string> {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: `${what} has to be text.` };
  const value = raw.trim();
  if (value.length > max) return { error: `Keep ${what.toLowerCase()} under ${max} characters.` };
  return { value };
}

function parseOneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T, what: string): Parsed<T> {
  if (raw === undefined || raw === null || raw === '') return { value: fallback };
  if (typeof raw !== 'string' || !allowed.includes(raw as T)) return { error: `Pick a ${what} from the list.` };
  return { value: raw as T };
}

function parseAmount(raw: unknown): Parsed<number | null> {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(/[,\s]/g, '')) : NaN;
  if (!Number.isFinite(n) || n < 0) return { error: 'The amount has to be a number, zero or more.' };
  if (n > 9_999_999_999_999) return { error: 'That amount is too large.' };
  return { value: Math.round(n * 100) / 100 };
}

function parseDate(raw: unknown, what: string): Parsed<string | null> {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  if (typeof raw !== 'string' || !DATE_SHAPE.test(raw)) return { error: `${what} has to be a date.` };
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    return { error: `${what} has to be a real date.` };
  }
  return { value: raw };
}

function parseId(raw: unknown, what: string): Parsed<string | null> {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  if (typeof raw !== 'string' || !UUID_SHAPE.test(raw)) return { error: `${what} is not valid.` };
  return { value: raw };
}

export function parseOpportunityCreate(body: unknown): Parsed<OpportunityCreate> {
  const b = record(body);
  const title = parseTitle(b.title);
  if ('error' in title) return title;
  const kind = parseOneOf(b.kind, OPPORTUNITY_KINDS, 'other', 'type');
  if ('error' in kind) return kind;
  const status = parseOneOf(b.status, OPPORTUNITY_STATUSES, 'idea', 'status');
  if ('error' in status) return status;
  const counterparty = parseText(b.counterparty, MAX_COUNTERPARTY, 'Who it is with');
  if ('error' in counterparty) return counterparty;
  const amount = parseAmount(b.amount);
  if ('error' in amount) return amount;
  const currency = parseOneOf(b.currency, OPPORTUNITY_CURRENCIES, 'NGN', 'currency');
  if ('error' in currency) return currency;
  const nextStep = parseText(b.nextStep, MAX_NEXT_STEP, 'The next step');
  if ('error' in nextStep) return nextStep;
  const nextStepOn = parseDate(b.nextStepOn, 'The next step date');
  if ('error' in nextStepOn) return nextStepOn;
  const deadlineOn = parseDate(b.deadlineOn, 'The deadline');
  if ('error' in deadlineOn) return deadlineOn;
  const notes = parseText(b.notes, MAX_NOTES, 'Notes');
  if ('error' in notes) return notes;
  const artistId = parseId(b.artistId, 'The artist');
  if ('error' in artistId) return artistId;
  const releaseId = parseId(b.releaseId, 'The rollout');
  if ('error' in releaseId) return releaseId;
  return {
    value: {
      title: title.value,
      kind: kind.value,
      status: status.value,
      counterparty: counterparty.value,
      amount: amount.value,
      currency: currency.value,
      nextStep: nextStep.value,
      nextStepOn: nextStepOn.value,
      deadlineOn: deadlineOn.value,
      notes: notes.value,
      artistId: artistId.value,
      releaseId: releaseId.value,
    },
  };
}

export function parseOpportunityPatch(body: unknown): Parsed<OpportunityPatch> {
  const b = record(body);
  const patch: OpportunityPatch = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(b, key);

  if (has('title')) {
    const r = parseTitle(b.title);
    if ('error' in r) return r;
    patch.title = r.value;
  }
  if (has('kind')) {
    if (b.kind === null || b.kind === undefined) return { error: 'Pick a type from the list.' };
    const r = parseOneOf(b.kind, OPPORTUNITY_KINDS, 'other', 'type');
    if ('error' in r) return r;
    patch.kind = r.value;
  }
  if (has('status')) {
    if (b.status === null || b.status === undefined) return { error: 'Pick a status from the list.' };
    const r = parseOneOf(b.status, OPPORTUNITY_STATUSES, 'idea', 'status');
    if ('error' in r) return r;
    patch.status = r.value;
  }
  if (has('counterparty')) {
    const r = parseText(b.counterparty, MAX_COUNTERPARTY, 'Who it is with');
    if ('error' in r) return r;
    patch.counterparty = r.value;
  }
  if (has('amount')) {
    const r = parseAmount(b.amount);
    if ('error' in r) return r;
    patch.amount = r.value;
  }
  if (has('currency')) {
    if (b.currency === null || b.currency === undefined) return { error: 'Pick a currency from the list.' };
    const r = parseOneOf(b.currency, OPPORTUNITY_CURRENCIES, 'NGN', 'currency');
    if ('error' in r) return r;
    patch.currency = r.value;
  }
  if (has('nextStep')) {
    const r = parseText(b.nextStep, MAX_NEXT_STEP, 'The next step');
    if ('error' in r) return r;
    patch.nextStep = r.value;
  }
  if (has('nextStepOn')) {
    const r = parseDate(b.nextStepOn, 'The next step date');
    if ('error' in r) return r;
    patch.nextStepOn = r.value;
  }
  if (has('deadlineOn')) {
    const r = parseDate(b.deadlineOn, 'The deadline');
    if ('error' in r) return r;
    patch.deadlineOn = r.value;
  }
  if (has('notes')) {
    const r = parseText(b.notes, MAX_NOTES, 'Notes');
    if ('error' in r) return r;
    patch.notes = r.value;
  }
  if (has('artistId')) {
    const r = parseId(b.artistId, 'The artist');
    if ('error' in r) return r;
    patch.artistId = r.value;
  }
  if (has('releaseId')) {
    const r = parseId(b.releaseId, 'The rollout');
    if ('error' in r) return r;
    patch.releaseId = r.value;
  }
  if (Object.keys(patch).length === 0) return { error: 'Nothing to save.' };
  return { value: patch };
}

export type OpportunityView = OpportunityFields & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

// Sorting and filtering ------------------------------------------------------

/** Today as YYYY-MM-DD in UTC, the frame the date columns are written in. */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type OpportunityFilter = {
  query?: string;
  kind?: OpportunityKind;
  /** 'open' hides the closed ones, 'closed' shows only those. */
  state?: 'open' | 'closed';
  status?: OpportunityStatus;
  artistId?: string;
};

export function filterOpportunities(
  items: readonly OpportunityView[],
  filter: OpportunityFilter
): OpportunityView[] {
  const terms = (filter.query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return items.filter((item) => {
    if (filter.kind && item.kind !== filter.kind) return false;
    if (filter.status && item.status !== filter.status) return false;
    if (filter.artistId && item.artistId !== filter.artistId) return false;
    if (filter.state === 'open' && isClosed(item.status)) return false;
    if (filter.state === 'closed' && !isClosed(item.status)) return false;
    if (terms.length === 0) return true;
    const haystack = `${item.title} ${item.counterparty} ${item.nextStep} ${item.notes}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** A past next-step date, or a past deadline, on something still in play. */
export function isOverdue(item: OpportunityView, today: string): boolean {
  if (isClosed(item.status)) return false;
  return (
    (item.nextStepOn !== null && item.nextStepOn < today) ||
    (item.deadlineOn !== null && item.deadlineOn < today)
  );
}

/**
 * What to do first: open ones before closed, overdue before the rest, then the
 * soonest date (a next step or a deadline, whichever comes first), then the
 * newest edit. Closed ones keep newest-first.
 */
export function sortOpportunities(items: readonly OpportunityView[], today: string): OpportunityView[] {
  const soonest = (item: OpportunityView): string => {
    const dates = [item.nextStepOn, item.deadlineOn].filter((d): d is string => d !== null);
    return dates.length ? dates.sort()[0] : '9999-12-31';
  };
  const rank = (item: OpportunityView): number => {
    if (isClosed(item.status)) return 2;
    return isOverdue(item, today) ? 0 : 1;
  };
  return [...items].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    if (rank(a) < 2) {
      const byDate = soonest(a).localeCompare(soonest(b));
      if (byDate !== 0) return byDate;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export type OpportunitySummary = { open: number; overdue: number; won: number };

export function summarizeOpportunities(items: readonly OpportunityView[], today: string): OpportunitySummary {
  let open = 0;
  let overdue = 0;
  let won = 0;
  for (const item of items) {
    if (item.status === 'won') won += 1;
    if (isClosed(item.status)) continue;
    open += 1;
    if (isOverdue(item, today)) overdue += 1;
  }
  return { open, overdue, won };
}

const CURRENCY_SYMBOL: Record<OpportunityCurrency, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };

/** "₦2,000,000", or an empty string when there is no number yet. */
export function formatAmount(amount: number | null, currency: OpportunityCurrency): string {
  if (amount === null) return '';
  const whole = Number.isInteger(amount);
  return `${CURRENCY_SYMBOL[currency]}${amount.toLocaleString('en', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "Due today", "Due in 3 days", "2 days late". Empty for no date. */
export function describeDate(date: string | null, today: string): string {
  if (!date) return '';
  const days = Math.round(
    (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  if (days === -1) return '1 day late';
  return `${-days} days late`;
}
