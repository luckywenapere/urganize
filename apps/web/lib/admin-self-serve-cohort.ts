// Self-serve checkout (2026-10-22): the admin cohort card. Self-serve against
// concierge (founder-approved) teams, split by plan and by how they paid:
// sign-ups, paid conversion, week-2 active and median founder minutes per
// paying team. Pure, so it is tested; the reads are in
// app/api/admin/self-serve/route.ts. Internal accounts are removed before this
// runs.
//
// Definitions, decided once:
//  - A team is in a cohort by workspaces.acquisition_path. 'legacy' (teams from
//    before this) is left out of both.
//  - Paid: the owner has paid at least once (profiles.paid_at set).
//  - Week-2 active: anybody on the team did a task action (a task_activity row
//    by them) on days 8 to 14 after the team was made. A team younger than 15
//    days is not counted either way.
//  - Founder minutes: the median of workspaces.founder_minutes over PAYING
//    teams, so unpaid sign-ups who never spoke to anyone do not drag it to 0.

export type CohortPath = 'self_serve' | 'concierge';
export const COHORT_PATHS: readonly CohortPath[] = ['self_serve', 'concierge'];

export type CohortTeam = {
  workspaceId: string;
  createdAt: string;
  acquisitionPath: string | null;
  /** The plan they pay for now, or null. */
  plan: string | null;
  paymentMethod: string | null;
  paid: boolean;
  founderMinutes: number;
  /** Times anyone on the team did a task action. */
  taskActionTimes: string[];
};

export type CohortCell = {
  signUps: number;
  paid: number;
  paidRate: number | null;
  /** Teams old enough to judge week 2. */
  week2Eligible: number;
  week2Active: number;
  week2Rate: number | null;
  medianFounderMinutes: number | null;
};

export type CohortRow = { key: string; label: string; selfServe: CohortCell; concierge: CohortCell };

const DAY_MS = 24 * 60 * 60 * 1000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** null when the team is too young to say. */
export function week2ActiveFor(team: Pick<CohortTeam, 'createdAt' | 'taskActionTimes'>, now: Date): boolean | null {
  const created = Date.parse(team.createdAt);
  if (!Number.isFinite(created)) return null;
  const start = created + 7 * DAY_MS;
  const end = created + 14 * DAY_MS;
  if (now.getTime() < end) return null;
  return team.taskActionTimes.some((at) => {
    const time = Date.parse(at);
    return Number.isFinite(time) && time >= start && time < end;
  });
}

export function cohortCell(teams: CohortTeam[], now: Date): CohortCell {
  const paidTeams = teams.filter((team) => team.paid);
  let eligible = 0;
  let active = 0;
  for (const team of teams) {
    const verdict = week2ActiveFor(team, now);
    if (verdict === null) continue;
    eligible += 1;
    if (verdict) active += 1;
  }
  return {
    signUps: teams.length,
    paid: paidTeams.length,
    paidRate: rate(paidTeams.length, teams.length),
    week2Eligible: eligible,
    week2Active: active,
    week2Rate: rate(active, eligible),
    medianFounderMinutes: median(paidTeams.map((team) => Math.max(0, team.founderMinutes))),
  };
}

const PLAN_ROWS: Array<{ key: string; label: string }> = [
  { key: 'solo', label: 'Solo' },
  { key: 'manager', label: 'Manager' },
  { key: 'label', label: 'Label' },
];

const METHOD_ROWS: Array<{ key: string; label: string }> = [
  { key: 'card', label: 'Card' },
  { key: 'transfer', label: 'Bank transfer' },
  { key: 'direct_transfer', label: 'Recorded transfer' },
];

export type CohortSummary = { all: CohortRow; byPlan: CohortRow[]; byMethod: CohortRow[] };

export function summarizeCohorts(input: { teams: CohortTeam[]; now: Date }): CohortSummary {
  const inPath = (path: CohortPath) => input.teams.filter((team) => team.acquisitionPath === path);
  const row = (key: string, label: string, keep: (team: CohortTeam) => boolean): CohortRow => ({
    key,
    label,
    selfServe: cohortCell(inPath('self_serve').filter(keep), input.now),
    concierge: cohortCell(inPath('concierge').filter(keep), input.now),
  });
  return {
    all: row('all', 'All teams', () => true),
    byPlan: PLAN_ROWS.map((plan) => row(plan.key, plan.label, (team) => team.plan === plan.key)),
    byMethod: METHOD_ROWS.map((method) => row(method.key, method.label, (team) => team.paymentMethod === method.key)),
  };
}

// ---------------------------------------------------------------- admin input

export type RecordTransferInput = {
  ownerEmail: string;
  amountKobo: number;
  receivedAt: Date;
  bankReference: string;
  plan: 'solo' | 'manager' | 'label';
  period: 'monthly' | 'semiannual' | 'annual';
  periodEnd: Date | null;
  note: string | null;
};

const PLANS = ['solo', 'manager', 'label'] as const;
const PERIODS = ['monthly', 'semiannual', 'annual'] as const;

function readDay(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Checks the admin's "Record transfer" form. Amount is in naira. */
export function parseRecordTransfer(
  body: unknown,
  now: Date
): { ok: true; value: RecordTransferInput } | { ok: false; error: string } {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const ownerEmail = typeof input.ownerEmail === 'string' ? input.ownerEmail.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return { ok: false, error: 'Enter the team owner email.' };
  const naira = typeof input.amountNaira === 'number' ? input.amountNaira : Number(input.amountNaira);
  if (!Number.isFinite(naira) || naira <= 0 || naira > 100_000_000) return { ok: false, error: 'Enter the amount received.' };
  const receivedAt = readDay(input.receivedAt);
  if (!receivedAt) return { ok: false, error: 'Enter the date it arrived.' };
  if (receivedAt.getTime() > now.getTime() + DAY_MS) return { ok: false, error: 'The date is in the future.' };
  const bankReference = typeof input.bankReference === 'string' ? input.bankReference.trim() : '';
  if (!bankReference) return { ok: false, error: 'Enter the bank reference.' };
  if (!(PLANS as readonly unknown[]).includes(input.plan)) return { ok: false, error: 'Pick a plan.' };
  if (!(PERIODS as readonly unknown[]).includes(input.period)) return { ok: false, error: 'Pick a period.' };
  let periodEnd: Date | null = null;
  if (input.periodEnd !== undefined && input.periodEnd !== null && input.periodEnd !== '') {
    periodEnd = readDay(input.periodEnd);
    if (!periodEnd || periodEnd.getTime() <= receivedAt.getTime()) {
      return { ok: false, error: 'The end date must be after the date it arrived.' };
    }
  }
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : null;
  return {
    ok: true,
    value: {
      ownerEmail,
      amountKobo: Math.round(naira * 100),
      receivedAt,
      bankReference: bankReference.slice(0, 120),
      plan: input.plan as RecordTransferInput['plan'],
      period: input.period as RecordTransferInput['period'],
      periodEnd,
      note,
    },
  };
}

export function parseFounderMinutes(body: unknown): { ok: true; workspaceId: string; minutes: number } | { ok: false; error: string } {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const workspaceId = typeof input.workspaceId === 'string' ? input.workspaceId : '';
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return { ok: false, error: 'Pick a team.' };
  const minutes = typeof input.minutes === 'number' ? input.minutes : Number(input.minutes);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 100_000) return { ok: false, error: 'Minutes must be a whole number.' };
  return { ok: true, workspaceId, minutes };
}
