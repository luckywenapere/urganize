/**
 * What a team's credit history says, turned from ledger rows into lines a person
 * reads. Pure: no IO, so a test can hold every label.
 *
 * The ledger is append-only and finer than a person cares about. A single turn
 * that drew on two sources (say the trial credits and then the allowance) is two
 * rows, and a person who spent 6 credits should see one line that says 6, not
 * two that add up to it. So spend rows that share a request are folded into one.
 *
 * It shows only what is the person's own business: what happened, when, how many
 * credits. The provider's cost, the models and the token counts that sit on the
 * rows are ours, and the route never selects them.
 */

import { pitchRefundHistoryLabel, pitchSpendHistoryLabel } from '@/lib/pitch-credits';

export type LedgerHistoryRow = {
  id: string;
  kind: string;
  pool: string;
  /** Signed: grants are positive, spends negative. */
  credits: number;
  dedupe_key: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type HistoryEntry = {
  /** The id of the newest row folded into this line. */
  id: string;
  at: string;
  label: string;
  /** An extra phrase, or '' when there is nothing true to add. */
  detail: string;
  /** Signed whole credits: positive adds to the balance, negative spends. */
  credits: number;
};

/** What an embedded action is called to the person who ran it. */
export const ACTION_HISTORY_LABELS: Record<string, string> = {
  'release.draft_plan': 'Built a rollout plan',
  'presskit.draft_section': 'Wrote part of a press kit',
  'release.fill_pitch': 'Filled a pitch kit',
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** `spend:<request id>:<source>` shares its middle part across the rows of one turn. */
function spendGroupKey(row: LedgerHistoryRow): string | null {
  // A pitch paid with credits (URG-345) is one spend row per source it drew on
  // (`spend:pitch:<id>:<source>`) and, when the curator missed the window, one
  // refund row per source (`refund:pitch:<id>:<source>`): one line each.
  if ((row.kind === 'spend' || row.kind === 'refund') && row.dedupe_key && row.metadata?.reason === 'pitch') {
    const parts = row.dedupe_key.split(':');
    if (parts.length === 4 && parts[1] === 'pitch') return `${parts[0]}:pitch:${parts[2]}`;
  }
  if (row.kind !== 'spend' || !row.dedupe_key) return null;
  // A voice call is charged a minute at a time (`spend:voice:<call>:m<n>:<source>`),
  // and the history shows it as ONE line for the whole call.
  const meta = row.metadata ?? {};
  if (meta.reason === 'voice_minute' && typeof meta.voice_session_id === 'string' && meta.voice_session_id) {
    return `voice:${meta.voice_session_id}`;
  }
  const parts = row.dedupe_key.split(':');
  if (parts[0] !== 'spend' || parts.length < 3) return null;
  return parts.slice(1, -1).join(':');
}

function labelFor(row: LedgerHistoryRow): { label: string; detail: string } {
  const meta = row.metadata ?? {};
  switch (row.kind) {
    case 'trial':
      return { label: 'Trial credits', detail: '' };
    case 'allowance':
      return { label: 'Monthly credits', detail: '' };
    case 'topup':
      return { label: 'Credits you bought', detail: '' };
    case 'spend': {
      if (meta.reason === 'pitch') {
        return { label: pitchSpendHistoryLabel(text(meta.curator_name)), detail: text(meta.song_title) };
      }
      if (meta.reason === 'voice_minute') {
        return { label: 'Voice call with AI', detail: '' };
      }
      if (meta.source === 'embedded_action') {
        const action = text(meta.action);
        return { label: ACTION_HISTORY_LABELS[action] ?? 'AI did some work', detail: '' };
      }
      return { label: 'AI chat', detail: '' };
    }
    case 'adjust': {
      if (meta.source === 'referral' && row.credits > 0) {
        return { label: 'Reward for inviting a team', detail: '' };
      }
      if (meta.source === 'referral') {
        return { label: 'Invite reward taken back', detail: 'A team you invited was refunded.' };
      }
      const note = text(meta.note);
      return {
        label: row.credits >= 0 ? 'Credits added by Urganize' : 'Credits taken off by Urganize',
        detail: note,
      };
    }
    case 'refund':
      if (meta.reason === 'pitch') {
        return { label: pitchRefundHistoryLabel(text(meta.curator_name)), detail: 'No reply in 7 days.' };
      }
      return { label: 'Credits refunded', detail: '' };
    case 'expire':
      return { label: 'Trial credits ended', detail: '' };
    default:
      return { label: 'Credits changed', detail: '' };
  }
}

/** Newest first. A row with an unreadable date sorts last rather than throwing. */
export function buildHistory(rows: readonly LedgerHistoryRow[]): HistoryEntry[] {
  const folded = new Map<string, HistoryEntry>();
  const entries: HistoryEntry[] = [];

  const sorted = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || 0);

  for (const row of sorted) {
    const whole = Math.trunc(Number(row.credits));
    if (!Number.isFinite(whole) || whole === 0) continue;

    const key = spendGroupKey(row);
    const existing = key ? folded.get(key) : undefined;
    if (existing) {
      existing.credits += whole;
      continue;
    }

    const { label, detail } = labelFor(row);
    const entry: HistoryEntry = { id: row.id, at: row.created_at, label, detail, credits: whole };
    entries.push(entry);
    if (key) folded.set(key, entry);
  }

  return entries;
}

/** "+100" / "-6", with a real minus sign never confused for a dash in copy. */
export function formatSignedCredits(credits: number): string {
  const whole = Math.trunc(credits);
  if (whole > 0) return `+${whole.toLocaleString('en')}`;
  if (whole < 0) return `-${Math.abs(whole).toLocaleString('en')}`;
  return '0';
}
