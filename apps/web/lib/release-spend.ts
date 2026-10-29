/**
 * Release spend: the rules (brief 3 of the release savings pack, 2026-10-09).
 *
 * Every rollout gets a list of what the team paid for on it, so the saving the
 * product claims can be measured by asking teams what a release cost before and
 * after. The app shows no "you saved ₦X" number anywhere: teams record what they
 * spent and the saving is worked out in interviews.
 *
 * Pure on purpose (no React, no I/O, no environment): categories and copy,
 * validation, totals, the spreadsheet export, the payback window and the credits
 * line. lib/release-spend-server.ts does the reads and writes through these, so
 * every rule here can be tested without a database.
 *
 * Money is integer kobo everywhere (lib/money.ts is the one door in and out).
 */

import { CREDIT_VALUE_KOBO } from './credits/pricing';
import { toCsvRow } from './csv';
import { addDays, dayNumber } from './lagos-day';
import { koboToPlainNaira, nairaToKobo } from './money';
import { presenceDay } from './presence';

// ---------------------------------------------------------------------------
// Categories, sources and copy
// ---------------------------------------------------------------------------

export const SPEND_CATEGORIES = [
  'distribution',
  'promo',
  'playlists',
  'video',
  'design',
  'writing_pr',
  'shows',
  'other',
] as const;

export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

/** The labels are the brief's, word for word. */
export const SPEND_CATEGORY_LABELS: Record<SpendCategory, string> = {
  distribution: 'Distribution',
  promo: 'Promo (DJs and blogs)',
  playlists: 'Playlists',
  video: 'Video',
  design: 'Design',
  writing_pr: 'Writing and PR',
  shows: 'Shows',
  other: 'Other',
};

export function isSpendCategory(value: unknown): value is SpendCategory {
  return typeof value === 'string' && (SPEND_CATEGORIES as readonly string[]).includes(value);
}

/** 'urganize' lines are written by Urganize itself and nobody can edit them. */
export type SpendSource = 'manual' | 'urganize';

/**
 * What a person reads. The first group is the brief's own text, used as
 * written, including the three strings that say "release" where the app says
 * rollout (the pack's README: UI text in a brief is final). Those exact phrases
 * are allowed by lib/rollout-vocabulary.test.ts. Everything marked TODO(copy)
 * is text the brief does not give and a screen needs; it is a plain placeholder
 * until the founder supplies the words.
 */
export const SPEND_COPY = {
  // ---- From the brief ----
  title: 'Spend',
  empty: 'Nothing logged yet. Add what you pay for on this release, so you can see where the money went.',
  addButton: 'Add spend',
  labels: {
    category: 'What for',
    amount: 'How much (₦)',
    paidTo: 'Paid to',
    date: 'Date',
    task: 'Task',
    note: 'Note',
  },
  automaticTag: 'Ordered in Urganize',
  totalLabel: 'Spent on this release',
  exportButton: 'Download CSV',
  homeTitle: 'Where the money went',
  // Home's card with nothing spent yet (2026-10-11): the brief's empty line,
  // without "on this release", since the card is for every rollout.
  homeEmpty: 'Nothing logged yet. Add what you pay for, so you can see where the money went.',
  homePickerLabel: 'Rollout',
  paybackLabels: {
    amount: 'Amount (₦)',
    note: 'Anything to add?',
  },

  // ---- TODO(copy): not in the brief ----
  // The buttons on a line, and the question before a delete.
  editButton: 'Edit',
  deleteButton: 'Delete',
  deleteConfirm: 'Delete this spend line?',
  saveButton: 'Save',
  cancelButton: 'Cancel',
  // The task picker's empty choice.
  noTask: 'No task',
  // Shown instead of the section when a signed-in person cannot see spend.
  noAccess: 'Only the rollout owner and team managers can see spend.',
  // The label on the payback row in the CSV.
  csvPaybackLabel: 'Paid back',
  csvPaybackNoteLabel: 'Payback note',
  // The payback answer under the total, and its form button.
  paybackAnswered: 'Paid back so far',
  paybackSave: 'Save answer',
  paybackEdit: 'Change answer',
  // The notification: the brief gives the question (paybackQuestion below) and
  // not the body of the push or the email.
  paybackNotificationBody: 'Add the amount so you can see where the money went.',
  // What an automatic credits line says it is paid to.
  creditsPaidTo: 'Urganize',
  // What the Spend section says when something happens or goes wrong.
  addedToast: 'Added to the list.',
  savedToast: 'Changes saved.',
  deletedToast: 'Line deleted.',
  paybackSavedToast: 'Answer saved.',
  paybackAdd: 'Add what it paid back',
  loadError: 'We could not load this section.',
  tryAgain: 'Try again',
  // The period under the Home card's total.
  homePeriod: 'Last 90 days',
  // The spreadsheet download, in the words the credits export already uses.
  csvDownloaded: 'Spreadsheet downloaded.',
  csvShared: 'Your spreadsheet is ready to save.',
  csvUnsupported: 'This app version cannot save files. Open team.urganize.app in your browser and export from there.',
} as const;

/** The payback question, the brief's wording. An untitled rollout is "this rollout". */
export function paybackQuestion(releaseTitle: string | null | undefined): string {
  const title = (releaseTitle ?? '').trim();
  return `What did ${title || 'this rollout'} pay back?`;
}

// ---------------------------------------------------------------------------
// Limits (they mirror the table's checks)
// ---------------------------------------------------------------------------

/** ₦1 billion. A net against a typo with too many zeros, not a business rule. */
export const MAX_SPEND_KOBO = 100_000_000_000;
export const MAX_PAID_TO_LENGTH = 200;
export const MAX_NOTE_LENGTH = 1000;
/** A date further out than this is almost certainly a typo for this year. */
const MAX_FUTURE_DAYS = 366;
const MIN_YEAR = 2000;

// ---------------------------------------------------------------------------
// Rows and the shapes the app uses
// ---------------------------------------------------------------------------

export type SpendLineRow = {
  id: string;
  release_id: string;
  category: string;
  amount_kobo: number | string;
  paid_to: string | null;
  spent_on: string;
  task_id: string | null;
  source: string;
  note: string | null;
  created_at: string;
};

export type SpendLine = {
  id: string;
  releaseId: string;
  category: SpendCategory;
  amountKobo: number;
  paidTo: string | null;
  /** "YYYY-MM-DD". */
  spentOn: string;
  taskId: string | null;
  source: SpendSource;
  /** True for a line Urganize wrote. It cannot be edited or deleted. */
  isAutomatic: boolean;
  note: string | null;
  createdAt: string;
};

/** A row as the app uses it. An unknown category reads as "other" and an
 *  unknown source as manual, so a bad value can never hide a line. */
export function toSpendLine(row: SpendLineRow): SpendLine {
  const source: SpendSource = row.source === 'urganize' ? 'urganize' : 'manual';
  return {
    id: row.id,
    releaseId: row.release_id,
    category: isSpendCategory(row.category) ? row.category : 'other',
    amountKobo: Number(row.amount_kobo) || 0,
    paidTo: row.paid_to,
    spentOn: String(row.spent_on).slice(0, 10),
    taskId: row.task_id,
    source,
    isAutomatic: source === 'urganize',
    note: row.note,
    createdAt: row.created_at,
  };
}

export type PaybackRow = {
  release_id: string;
  asked_at: string;
  amount_kobo: number | string | null;
  note: string | null;
  answered_at: string | null;
};

export type Payback = {
  askedAt: string;
  /** Null until answered. Zero is a real answer. */
  amountKobo: number | null;
  note: string | null;
  answeredAt: string | null;
};

export function toPayback(row: PaybackRow): Payback {
  const answered = row.answered_at !== null && row.amount_kobo !== null;
  return {
    askedAt: row.asked_at,
    amountKobo: answered ? Number(row.amount_kobo) : null,
    note: row.note,
    answeredAt: answered ? row.answered_at : null,
  };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export function totalKobo(lines: ReadonlyArray<{ amountKobo: number }>): number {
  return lines.reduce((sum, line) => sum + (Number.isFinite(line.amountKobo) ? line.amountKobo : 0), 0);
}

/** Newest first: by the day it was spent, then by when it was added. */
export function sortSpendLines(lines: readonly SpendLine[]): SpendLine[] {
  return [...lines].sort((a, b) => {
    if (a.spentOn !== b.spentOn) return a.spentOn < b.spentOn ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export type CategoryTotal = { category: SpendCategory; label: string; amountKobo: number };

/** What the Home card draws: the largest category first, categories with
 *  nothing left out, ties in the brief's category order. */
export function spendByCategory(lines: ReadonlyArray<{ category: SpendCategory; amountKobo: number }>): CategoryTotal[] {
  const sums = new Map<SpendCategory, number>();
  for (const line of lines) {
    if (!Number.isFinite(line.amountKobo) || line.amountKobo <= 0) continue;
    sums.set(line.category, (sums.get(line.category) ?? 0) + line.amountKobo);
  }
  return SPEND_CATEGORIES.filter((category) => (sums.get(category) ?? 0) > 0)
    .map((category) => ({
      category,
      label: SPEND_CATEGORY_LABELS[category],
      amountKobo: sums.get(category) ?? 0,
    }))
    .sort((a, b) => b.amountKobo - a.amountKobo);
}

/** The Home card looks at the last 90 days. */
export const HOME_SPEND_DAYS = 90;

/** The first day the Home card counts, as "YYYY-MM-DD". */
export function homeSpendSince(now: Date): string {
  return addDays(presenceDay(now), -(HOME_SPEND_DAYS - 1)) ?? presenceDay(now);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** What a new line carries. */
export type SpendDraft = {
  category: SpendCategory;
  amountKobo: number;
  paidTo: string | null;
  spentOn: string;
  taskId: string | null;
  note: string | null;
};

/** TODO(copy): the validation messages are not in the brief. */
export const SPEND_ERRORS = {
  category: 'Pick what it was for.',
  amount: 'Enter an amount above ₦0.',
  amountTooLarge: 'That amount is too large.',
  date: 'Enter a real date.',
  paidTo: 'Paid to is too long.',
  note: 'The note is too long.',
  task: 'Pick a task from this rollout.',
  nothing: 'Nothing to change.',
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FULL_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trimmed text, with blank counting as nothing. */
function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** A real calendar day, not absurdly far away, as "YYYY-MM-DD", or null. */
export function parseSpendDate(value: unknown, today: string): string | null {
  if (typeof value !== 'string') return null;
  const day = value.trim();
  if (!FULL_DAY.test(day)) return null;
  const number = dayNumber(day);
  const todayNumber = dayNumber(today);
  if (number === null || todayNumber === null) return null;
  if (Number(day.slice(0, 4)) < MIN_YEAR) return null;
  if (number - todayNumber > MAX_FUTURE_DAYS) return null;
  return day;
}

/** The amount a person typed, as kobo, or an error. Zero is not a spend. */
function parseAmount(value: unknown): ParseResult<number> {
  const kobo = typeof value === 'string' || typeof value === 'number' ? nairaToKobo(value) : null;
  if (kobo === null) return { ok: false, error: SPEND_ERRORS.amount };
  if (!Number.isSafeInteger(kobo) || kobo > MAX_SPEND_KOBO) {
    return { ok: false, error: SPEND_ERRORS.amountTooLarge };
  }
  return { ok: true, value: kobo };
}

function parseTaskId(value: unknown): ParseResult<string | null> {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || !UUID.test(value.trim())) return { ok: false, error: SPEND_ERRORS.task };
  return { ok: true, value: value.trim().toLowerCase() };
}

function parsePaidTo(value: unknown): ParseResult<string | null> {
  const text = cleanText(value);
  if (text !== null && text.length > MAX_PAID_TO_LENGTH) return { ok: false, error: SPEND_ERRORS.paidTo };
  return { ok: true, value: text };
}

function parseNote(value: unknown): ParseResult<string | null> {
  const text = cleanText(value);
  if (text !== null && text.length > MAX_NOTE_LENGTH) return { ok: false, error: SPEND_ERRORS.note };
  return { ok: true, value: text };
}

/**
 * A new line from a request body. The amount arrives as the naira a person
 * typed (`amountNaira`) and is converted here, once, so a client cannot send
 * kobo that was worked out wrongly. The date defaults to today, the brief's
 * default.
 */
export function parseSpendCreate(body: unknown, today: string): ParseResult<SpendDraft> {
  if (!isRecord(body)) return { ok: false, error: SPEND_ERRORS.category };
  if (!isSpendCategory(body.category)) return { ok: false, error: SPEND_ERRORS.category };

  const amount = parseAmount(body.amountNaira);
  if (!amount.ok) return amount;

  const spentOn =
    body.spentOn === undefined || body.spentOn === null || body.spentOn === ''
      ? today
      : parseSpendDate(body.spentOn, today);
  if (spentOn === null) return { ok: false, error: SPEND_ERRORS.date };

  const paidTo = parsePaidTo(body.paidTo);
  if (!paidTo.ok) return paidTo;
  const task = parseTaskId(body.taskId);
  if (!task.ok) return task;
  const note = parseNote(body.note);
  if (!note.ok) return note;

  return {
    ok: true,
    value: {
      category: body.category,
      amountKobo: amount.value,
      paidTo: paidTo.value,
      spentOn,
      taskId: task.value,
      note: note.value,
    },
  };
}

/**
 * An edit. A key that is absent is left alone and a key that is null clears the
 * optional ones (paid to, task, note): the same three states every sparse
 * update here has, since treating absent as null would wipe a note whenever
 * somebody changed only the amount. What for, how much and the date cannot be
 * cleared, only replaced.
 */
export function parseSpendPatch(body: unknown, today: string): ParseResult<Partial<SpendDraft>> {
  if (!isRecord(body)) return { ok: false, error: SPEND_ERRORS.nothing };
  const patch: Partial<SpendDraft> = {};

  if ('category' in body) {
    if (!isSpendCategory(body.category)) return { ok: false, error: SPEND_ERRORS.category };
    patch.category = body.category;
  }
  if ('amountNaira' in body) {
    const amount = parseAmount(body.amountNaira);
    if (!amount.ok) return amount;
    patch.amountKobo = amount.value;
  }
  if ('spentOn' in body) {
    const spentOn = parseSpendDate(body.spentOn, today);
    if (spentOn === null) return { ok: false, error: SPEND_ERRORS.date };
    patch.spentOn = spentOn;
  }
  if ('paidTo' in body) {
    const paidTo = parsePaidTo(body.paidTo);
    if (!paidTo.ok) return paidTo;
    patch.paidTo = paidTo.value;
  }
  if ('taskId' in body) {
    const task = parseTaskId(body.taskId);
    if (!task.ok) return task;
    patch.taskId = task.value;
  }
  if ('note' in body) {
    const note = parseNote(body.note);
    if (!note.ok) return note;
    patch.note = note.value;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: SPEND_ERRORS.nothing };
  return { ok: true, value: patch };
}

/** The payback answer. Nothing paid back is a real answer, so zero is allowed. */
export type PaybackAnswer = { amountKobo: number; note: string | null };

export function parsePaybackAnswer(body: unknown): ParseResult<PaybackAnswer> {
  if (!isRecord(body)) return { ok: false, error: SPEND_ERRORS.amount };
  const raw = body.amountNaira;
  let amountKobo: number | null = null;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const cleaned = String(raw).replace(/[₦,\s]/g, '');
    amountKobo = /^0+(\.0{1,2})?$/.test(cleaned) ? 0 : nairaToKobo(raw);
  }
  if (amountKobo === null) return { ok: false, error: 'Enter an amount, or 0 if nothing came back.' };
  if (!Number.isSafeInteger(amountKobo) || amountKobo > MAX_SPEND_KOBO) {
    return { ok: false, error: SPEND_ERRORS.amountTooLarge };
  }
  const note = parseNote(body.note);
  if (!note.ok) return note;
  return { ok: true, value: { amountKobo, note: note.value } };
}

// ---------------------------------------------------------------------------
// The spreadsheet
// ---------------------------------------------------------------------------

/** Excel reads a file as the local code page unless it starts with this, and
 *  then turns "₦" into mojibake. */
export const CSV_BOM = '﻿';

/**
 * A cell that starts with = + - @ or a tab or carriage return is read as a
 * FORMULA by Excel and Google Sheets even when quoted, so text a teammate typed
 * ("=HYPERLINK(...)") would run when somebody opens the export. A leading
 * apostrophe makes it plain text. Applied to every free-text cell; the amounts
 * are digits and are never touched.
 */
export function neutraliseFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/**
 * The rollout's lines as a CSV, plus the payback answer.
 *
 * Amounts are PLAIN NAIRA NUMBERS ("50000", "50000.50"), never "₦50,000": a
 * cell with a sign and a comma is text to a spreadsheet and cannot be summed,
 * and summing is the point of an export. The summary rows sit below a blank row
 * and use only the first two columns, so summing the Amount column still adds
 * up the lines and nothing else.
 */
export function buildSpendCsv(input: {
  lines: readonly SpendLine[];
  payback: Payback | null;
  /** Task titles by id, for the Task column. */
  taskTitles?: ReadonlyMap<string, string> | Record<string, string>;
}): string {
  const titleFor = (id: string | null): string => {
    if (!id || !input.taskTitles) return '';
    const titles = input.taskTitles;
    return (titles instanceof Map ? titles.get(id) : (titles as Record<string, string>)[id]) ?? '';
  };

  const header = ['Date', SPEND_COPY.labels.category, SPEND_COPY.labels.amount, SPEND_COPY.labels.paidTo, SPEND_COPY.labels.task, SPEND_COPY.labels.note, 'Source'];
  const rows: string[] = [toCsvRow(header)];

  for (const line of sortSpendLines(input.lines)) {
    rows.push(
      toCsvRow([
        line.spentOn,
        neutraliseFormula(SPEND_CATEGORY_LABELS[line.category]),
        koboToPlainNaira(line.amountKobo),
        neutraliseFormula(line.paidTo ?? ''),
        neutraliseFormula(titleFor(line.taskId)),
        neutraliseFormula(line.note ?? ''),
        line.isAutomatic ? SPEND_COPY.automaticTag : '',
      ])
    );
  }

  rows.push('');
  rows.push(toCsvRow([SPEND_COPY.totalLabel, koboToPlainNaira(totalKobo(input.lines))]));
  if (input.payback && input.payback.amountKobo !== null) {
    rows.push(toCsvRow([SPEND_COPY.csvPaybackLabel, koboToPlainNaira(input.payback.amountKobo)]));
    if (input.payback.note) {
      rows.push(toCsvRow([SPEND_COPY.csvPaybackNoteLabel, neutraliseFormula(input.payback.note)]));
    }
  }

  return CSV_BOM + rows.join('\r\n');
}

/** "midnight-ep-spend-2026-10-09.csv": names the rollout so exporting three in a sitting does not collide. */
export function spendCsvFileName(releaseTitle: string | null | undefined, today: string): string {
  const slug = (releaseTitle ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return `${slug || 'rollout'}-spend-${today}.csv`;
}

// ---------------------------------------------------------------------------
// The payback question
// ---------------------------------------------------------------------------

/** The question goes out 30 days after release day. */
export const PAYBACK_DAYS_AFTER_RELEASE = 30;
/** And is only ever sent on that day or the two after it, so a cron that missed
 *  a day still asks, and a rollout that went out months ago is never asked in a
 *  mass the day this ships. */
export const PAYBACK_CATCH_UP_DAYS = 3;

/** The day the question is due, as "YYYY-MM-DD", or null with no release day. */
export function paybackDueDay(releaseDate: string | null | undefined): string | null {
  return addDays(releaseDate, PAYBACK_DAYS_AFTER_RELEASE);
}

export type PaybackWindow = 'no_date' | 'not_yet' | 'open' | 'past';

/**
 * Where "now" sits against the question's window, in Lagos days. 'open' is the
 * due day and the two after it. Past means too late to ask without it being a
 * message about something from a long time ago.
 */
export function paybackWindow(releaseDate: string | null | undefined, now: Date): PaybackWindow {
  const due = dayNumber(paybackDueDay(releaseDate));
  const today = dayNumber(presenceDay(now));
  if (due === null || today === null) return 'no_date';
  const since = today - due;
  if (since < 0) return 'not_yet';
  return since < PAYBACK_CATCH_UP_DAYS ? 'open' : 'past';
}

// ---------------------------------------------------------------------------
// The credits line
// ---------------------------------------------------------------------------

/** What one credit is worth, in kobo: $0.01 at 1,500 naira to the dollar is ₦15. */
export { CREDIT_VALUE_KOBO };

/** The amount of the automatic line for a day's credits. */
export function creditsLineAmountKobo(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return Math.round(credits) * CREDIT_VALUE_KOBO;
}

/** TODO(copy): the note on the automatic credits line. */
export function creditsLineNote(credits: number): string {
  const count = Math.round(credits);
  return `${count} UrgAns ${count === 1 ? 'credit' : 'credits'}`;
}

/** One line per rollout per day, so a sweep that runs twice writes it once. */
export function creditsDedupeKey(releaseId: string, day: string): string {
  return `credits:${releaseId}:${day}`;
}

/** How many finished Lagos days each sweep looks back over. */
export const CREDITS_SWEEP_DAYS = 3;

/**
 * The Lagos days a sweep covers: the last three COMPLETE days, oldest first.
 * Today is left out because it is still filling up; a line written from half a
 * day would be wrong until tomorrow's sweep corrected it. Three days, not one,
 * so a call recorded late (or a sweep that missed a morning) is still folded in.
 */
export function creditsSweepDays(now: Date): string[] {
  const today = presenceDay(now);
  const days: string[] = [];
  for (let back = CREDITS_SWEEP_DAYS; back >= 1; back -= 1) {
    const day = addDays(today, -back);
    if (day) days.push(day);
  }
  return days;
}

/** The credits a rollout spent, summed per Lagos day, from the usage log. */
export type CreditsUsageRow = { releaseId: string; createdAt: string; creditsCharged: number };
export type CreditsDayTotal = { releaseId: string; day: string; credits: number };

export function groupCreditsByReleaseDay(rows: readonly CreditsUsageRow[], days?: readonly string[]): CreditsDayTotal[] {
  const wanted = days ? new Set(days) : null;
  const totals = new Map<string, CreditsDayTotal>();
  for (const row of rows) {
    const credits = Number(row.creditsCharged);
    if (!row.releaseId || !Number.isFinite(credits) || credits <= 0) continue;
    const stamp = new Date(row.createdAt);
    if (Number.isNaN(stamp.getTime())) continue;
    const day = presenceDay(stamp);
    if (wanted && !wanted.has(day)) continue;
    const key = `${row.releaseId}|${day}`;
    const existing = totals.get(key);
    if (existing) existing.credits += credits;
    else totals.set(key, { releaseId: row.releaseId, day, credits });
  }
  return [...totals.values()].sort((a, b) =>
    a.day === b.day ? (a.releaseId < b.releaseId ? -1 : 1) : a.day < b.day ? -1 : 1
  );
}

/** The UTC moment a Lagos day starts, as an ISO string. Lagos is UTC+1 all year. */
export function lagosDayStartIso(day: string): string | null {
  const number = dayNumber(day);
  if (number === null) return null;
  return new Date(number * 24 * 60 * 60 * 1000 - 60 * 60 * 1000).toISOString();
}
