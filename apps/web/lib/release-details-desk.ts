/**
 * Release details on a computer (#1230, mock docs/mocks/brief-details-desktop).
 *
 * The page the Distribute checklist's Details "Fix" opens: every field in three
 * cards, the missing required ones marked, a count on the right, and the
 * credits collected through the link. This holds the rules so they are tested
 * without a browser. Pure: no React, no I/O.
 *
 * Required means what the store check (lib/distribution-rules.ts) already
 * refuses an order over: genre, language and the explicit answer. Nothing else
 * is marked, so this page never asks for more than the check does.
 */

import { formatPercent, splitTotalIsOff, sumSplits } from './credit-split-totals';

/** The form's values this page reads. */
export type DetailsForm = {
  genre: string;
  subgenre: string;
  language: string;
  featuredArtists: string;
  isrc: string;
  upc: string;
  iswc: string;
  labelName: string;
  pLine: string;
  cLine: string;
  /** Null until somebody answers. No is an answer. */
  explicit: boolean | null;
};

export type DetailsFieldKey = keyof DetailsForm;

/** Every box, in the order the page shows them, with the name it shows. */
export const DETAILS_FIELDS: readonly { key: DetailsFieldKey; label: string }[] = [
  { key: 'genre', label: 'Genre' },
  { key: 'subgenre', label: 'Subgenre' },
  { key: 'language', label: 'Language' },
  { key: 'featuredArtists', label: 'Featured artist' },
  { key: 'explicit', label: 'Explicit' },
  { key: 'isrc', label: 'ISRC' },
  { key: 'upc', label: 'UPC' },
  { key: 'iswc', label: 'ISWC' },
  { key: 'labelName', label: 'Label name' },
  { key: 'pLine', label: '℗ line' },
  { key: 'cLine', label: '© line' },
];

/** What the store check refuses an order without, and where to get it. */
export const REQUIRED_DETAILS: Partial<Record<DetailsFieldKey, string>> = {
  genre: 'Stores need this one. Pick the closest genre. The artist will know.',
  language: 'Stores need this one. It is the language the words are sung in.',
  explicit: 'Stores need this one. Say yes if the words swear or talk about adult things.',
};

const filled = (form: DetailsForm, key: DetailsFieldKey): boolean => {
  const value = form[key];
  if (key === 'explicit') return value === true || value === false;
  return typeof value === 'string' && value.trim().length > 0;
};

/** The required fields still empty, in page order. */
export function missingRequiredDetails(form: DetailsForm): DetailsFieldKey[] {
  return DETAILS_FIELDS.map((field) => field.key).filter((key) => key in REQUIRED_DETAILS && !filled(form, key));
}

export type DetailsProgress = {
  filled: number;
  total: number;
  /** The one line under the count: what to fill next, or that all is in. */
  line: string;
};

/**
 * "9 of 11 filled in" and the next box to fill. A required box that is empty
 * comes before an optional one, because it is the one that holds up sending.
 */
export function detailsProgress(form: DetailsForm): DetailsProgress {
  const empty = DETAILS_FIELDS.filter((field) => !filled(form, field.key));
  const total = DETAILS_FIELDS.length;
  const done = total - empty.length;
  if (empty.length === 0) return { filled: done, total, line: 'Everything is filled in.' };
  const required = empty.filter((field) => field.key in REQUIRED_DETAILS);
  const next = (required[0] ?? empty[0]).label;
  if (empty.length === 1) return { filled: done, total, line: `${next} is the last one.` };
  return {
    filled: done,
    total,
    line: required.length > 0 ? `${next} is next. Stores need it.` : `${next} is next.`,
  };
}

/** One answer from the credits link, as the Credits card needs it. */
export type CreditAnswer = {
  roles: readonly string[];
  songwriterSplit: number | null;
  masterSplit: number | null;
};

/** "Songwriter, Producer · 50% writing · 25% recording". Roles come in as labels. */
export function creditAnswerLine(roleLabels: readonly string[], answer: Pick<CreditAnswer, 'songwriterSplit' | 'masterSplit'>): string {
  const parts: string[] = [];
  if (roleLabels.length > 0) parts.push(roleLabels.join(', '));
  if (answer.songwriterSplit !== null) parts.push(`${formatPercent(answer.songwriterSplit)} writing`);
  if (answer.masterSplit !== null) parts.push(`${formatPercent(answer.masterSplit)} recording`);
  return parts.join(' · ');
}

export type SplitsCheck = { label: string; value: string; off: boolean };

/**
 * The line under the answers: whether each kind of share adds up to 100. A
 * kind nobody answered is left out, so a team that has not asked for splits
 * is not told they are off.
 */
export function splitsChecks(answers: readonly CreditAnswer[]): SplitsCheck[] {
  const out: SplitsCheck[] = [];
  const writing = sumSplits(answers.map((answer) => answer.songwriterSplit));
  const recording = sumSplits(answers.map((answer) => answer.masterSplit));
  if (writing.answered) {
    out.push({ label: 'Writing shares add up', value: formatPercent(writing.total), off: splitTotalIsOff(writing.total) });
  }
  if (recording.answered) {
    out.push({ label: 'Recording shares add up', value: formatPercent(recording.total), off: splitTotalIsOff(recording.total) });
  }
  return out;
}
