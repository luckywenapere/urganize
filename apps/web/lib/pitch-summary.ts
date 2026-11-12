// The desktop Pitch tab's summary card (#1215, part of #1175; approved mock
// docs/mocks/pitch-desktop). Pure: what the dark card on the right adds up as
// curators are ticked, and whether the team holds enough credits to send.
//
// The rule matches CreditPitchPicker's send path: a balance we could not read
// is never called short (the send route answers "insufficient" and the top-up
// sheet opens from there), and free picks are always enough.

import { CREDIT_PITCH_REPLY_DAYS, normalizeCreditPrice, selectionTotal } from './pitch-credits';

export type PickedCurator = { id: string; curatorName: string; creditPrice?: unknown };
export type SummaryLine = { id: string; name: string; credits: number };

export type PitchSummary = {
  count: number;
  lines: SummaryLine[];
  total: number;
  /** What the team holds, or null when it could not be read. */
  balance: number | null;
  /** Credits missing for this selection; 0 when enough or unknown. */
  short: number;
  /** null when the balance is unknown and something costs credits. */
  enough: boolean | null;
  /** Something is picked. Being short still sends, through the top-up sheet. */
  canSend: boolean;
};

const readBalance = (value: number | null): number | null =>
  value === null || !Number.isFinite(value) ? null : Math.max(0, Math.floor(value));

export function pitchSummary(picked: readonly PickedCurator[], rawBalance: number | null): PitchSummary {
  const lines = picked.map((entry) => ({
    id: entry.id,
    name: entry.curatorName,
    credits: normalizeCreditPrice(entry.creditPrice),
  }));
  const total = selectionTotal(lines.map((line) => line.credits));
  const balance = readBalance(rawBalance);
  const short = balance !== null && total > balance ? total - balance : 0;
  const enough = total === 0 ? true : balance === null ? null : short === 0;
  return { count: lines.length, lines, total, balance, short, enough, canSend: lines.length > 0 };
}

const n = (value: number): string => Math.trunc(value).toLocaleString('en');

export const curatorsPicked = (count: number): string =>
  count === 0 ? 'No curators picked' : `${count} ${count === 1 ? 'curator' : 'curators'} picked`;

export const sendToCurators = (count: number): string =>
  count === 0 ? 'Send to curators' : `Send to ${count} ${count === 1 ? 'curator' : 'curators'}`;

export const creditsAmount = (credits: number): string =>
  credits <= 0 ? 'Free' : `${n(credits)} ${credits === 1 ? 'credit' : 'credits'}`;

export const shortLine = (short: number): string => `You need ${n(short)} more ${short === 1 ? 'credit' : 'credits'}.`;

export const PICK_PROMISE = `No reply in ${CREDIT_PITCH_REPLY_DAYS} days and the credits come back to you.`;
export const NOTHING_PICKED_LINE = 'Tick curators on the left to see what it costs.';
export const FREE_PICKS_LINE = 'Free curators cost nothing. Their replies land in Sent.';

/** "Sent 3 Nov", in Lagos time. */
export function sentDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).format(date);
  return `Sent ${day}`;
}
