/**
 * Referral partners and their commission. Pure: no database, no React.
 *
 * The terms come from the strategy doc (docs/strategy/company-strategy.md,
 * section 10, "Sound Wave Spotlight terms"):
 *   - a partner has a code, and teams that sign up with it are tagged to them;
 *   - commission is 10% of those teams' subscription payments, for each team's
 *     first 12 months;
 *   - it is paid monthly by the 10th, on payments that cleared the month before;
 *   - nothing is paid on refunds, credits or distribution.
 *
 * Everything that decides a number lives here, so it can be tested. The IO is in
 * `referrals-server.ts`.
 *
 * Two readings of the doc, stated so they can be challenged:
 *   - "first 12 months" counts from the team's first COUNTED payment, not from
 *     signup. A team that takes a week to pay still gets its twelve months.
 *   - a payment on or after the moment a team was tagged counts; one before it
 *     never does, so tagging a team that already pays cannot reach into history.
 *
 * "Credits and distribution earn nothing" needs no code here: credit packs and
 * distribution orders never become subscription_charges rows, so they cannot
 * reach this file. Refunds are manual: an admin excludes the payment.
 */

/** NEXT_PUBLIC_FEATURE_REFERRALS, default off. With it off nothing is tagged and
 *  the webhook records nothing extra. Settling money that is already owed (the
 *  admin page, payouts) does not depend on it. */
export function isReferralsEnabled(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_FEATURE_REFERRALS: process.env.NEXT_PUBLIC_FEATURE_REFERRALS,
  }
): boolean {
  return String(env.NEXT_PUBLIC_FEATURE_REFERRALS ?? '').trim().toLowerCase() === 'true';
}

export const REFERRAL_CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

/** The code as the database stores it, or null when it could not be one.
 *  Case-insensitive on the way in because it is read off a link. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

/** The link a partner shares. The marketing site's signup button points at the
 *  app's onboarding, and `ref` rides along. */
export function referralLink(code: string, appOrigin = 'https://app.urganize.app'): string {
  return `${appOrigin.replace(/\/+$/, '')}/onboarding?ref=${encodeURIComponent(code)}`;
}

/** A tag is only accepted on a team this new. After that a code typed into a
 *  link is somebody trying to claim a team that was never referred. */
export const ATTACH_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AttachRefusal =
  | 'bad_code'
  | 'unknown_code'
  | 'inactive_code'
  | 'no_team'
  | 'already_tagged'
  | 'own_code'
  | 'joined_by_invite'
  | 'too_late';

export type AttachInput = {
  /** What the code resolved to, or null when nothing matched. */
  partner: { active: boolean } | null;
  /** The code was well formed. */
  codeWasValid: boolean;
  /** The caller's own team, or null when they do not own one yet. */
  workspace: { createdAt: string | null } | null;
  alreadyTagged: boolean;
  /** The code is the caller's own personal code. A team cannot refer itself. */
  selfReferral?: boolean;
  /** The caller belongs to somebody else's team through an invite. Invitees join
   *  an existing team and are never a referral. */
  joinedByInvite: boolean;
  now: Date;
  /** The founder is tagging by hand and knows the team's history, so the two
   *  rules that guard against self-service gaming (invite and age) are skipped.
   *  A bad code, a switched-off partner and a team that is already tagged still
   *  refuse. */
  skipSelfServiceChecks?: boolean;
};

export function decideAttach(input: AttachInput): { ok: true } | { ok: false; reason: AttachRefusal } {
  if (!input.codeWasValid) return { ok: false, reason: 'bad_code' };
  if (!input.partner) return { ok: false, reason: 'unknown_code' };
  if (!input.partner.active) return { ok: false, reason: 'inactive_code' };
  if (!input.workspace) return { ok: false, reason: 'no_team' };
  if (input.alreadyTagged) return { ok: false, reason: 'already_tagged' };
  if (input.selfReferral) return { ok: false, reason: 'own_code' };
  if (input.skipSelfServiceChecks) return { ok: true };
  if (input.joinedByInvite) return { ok: false, reason: 'joined_by_invite' };
  const created = input.workspace.createdAt ? new Date(input.workspace.createdAt).getTime() : NaN;
  // An unreadable creation date is refused rather than waved through: tagging is
  // the one step that decides who gets paid, so it fails closed.
  if (!Number.isFinite(created)) return { ok: false, reason: 'too_late' };
  if (input.now.getTime() - created > ATTACH_WINDOW_DAYS * DAY_MS) {
    return { ok: false, reason: 'too_late' };
  }
  return { ok: true };
}

/** Plain words for a refusal, shown on the admin page when tagging by hand. */
export function describeAttachRefusal(reason: AttachRefusal): string {
  switch (reason) {
    case 'bad_code':
      return 'That is not a valid referral code.';
    case 'unknown_code':
      return 'No partner has that code.';
    case 'inactive_code':
      return 'That partner is switched off.';
    case 'no_team':
      return 'That person has no team yet.';
    case 'already_tagged':
      return 'That team is already tagged to a partner.';
    case 'own_code':
      return 'A team cannot use its own invite code.';
    case 'joined_by_invite':
      return 'That person joined through an invite, so they cannot be a referral.';
    case 'too_late':
      return `Teams can only be tagged in their first ${ATTACH_WINDOW_DAYS} days.`;
  }
}

// ---------------------------------------------------------------- commission

export type CommissionTerms = { commissionBps: number; commissionMonths: number };

export type LedgerCharge = {
  reference: string;
  workspaceId: string | null;
  amountKobo: number;
  chargedAt: string;
  source: string;
  excluded: boolean;
};

export type TaggedTeam = { workspaceId: string; name: string | null; attachedAt: string };

export type PayoutRecord = { month: string; amountKobo: number; paidAt: string };

/** Commission on one payment, rounded DOWN to the kobo so the total can never
 *  exceed the agreed percentage. */
export function commissionOnCharge(amountKobo: number, commissionBps: number): number {
  if (!Number.isFinite(amountKobo) || amountKobo <= 0) return 0;
  return Math.floor((amountKobo * commissionBps) / 10_000);
}

/** `date` plus whole calendar months, in UTC, clamped to the last day of the
 *  target month (31 January plus one month is 28 or 29 February). */
export function addMonthsUtc(date: Date, months: number): Date {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds())
  );
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

/** The calendar month a payment cleared in, 'YYYY-MM', in Lagos time. Lagos is
 *  UTC+1 all year with no daylight saving, so a fixed shift is exact. */
export function lagosMonth(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${month}`;
}

/** When a month's payout is due: the 10th of the following month, as 'YYYY-MM-10'. */
export function payoutDueDate(month: string): string {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const next = Number(monthText) + 1;
  const dueYear = next > 12 ? year + 1 : year;
  const dueMonth = next > 12 ? 1 : next;
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-10`;
}

/** Whether the due date has passed, counting the whole of the 10th (Lagos). */
export function isPastDue(month: string, now: Date): boolean {
  const due = payoutDueDate(month);
  const endOfDue = new Date(`${due}T23:59:59+01:00`).getTime();
  return now.getTime() > endOfDue;
}

export type TeamLine = {
  workspaceId: string;
  name: string | null;
  attachedAt: string;
  /** Null until the team has a counted payment. */
  firstChargeAt: string | null;
  /** When the commission window closes; null until the first payment. */
  windowEndsAt: string | null;
  /** Payments that earned commission. */
  chargeCount: number;
  baseKobo: number;
  commissionKobo: number;
  /** The window is still open (or has not started). */
  earning: boolean;
};

export type MonthLine = {
  month: string;
  chargeCount: number;
  baseKobo: number;
  commissionKobo: number;
  paidKobo: number | null;
  paidAt: string | null;
  /** What is still owed for the month; never negative. */
  outstandingKobo: number;
  /** Paid more than is now owed, for example after a refund was excluded. */
  overpaidKobo: number;
  dueOn: string;
  overdue: boolean;
};

export type PartnerStatement = {
  teams: TeamLine[];
  months: MonthLine[];
  totalCommissionKobo: number;
  totalPaidKobo: number;
  totalOutstandingKobo: number;
};

/**
 * Works out what a partner is owed from the raw records. Nothing it returns is
 * stored, so a refund or a changed rate shows up on the next load.
 */
export function buildPartnerStatement(input: {
  terms: CommissionTerms;
  teams: TaggedTeam[];
  charges: LedgerCharge[];
  payouts: PayoutRecord[];
  now: Date;
}): PartnerStatement {
  const { terms, now } = input;
  const chargesByTeam = new Map<string, LedgerCharge[]>();
  for (const charge of input.charges) {
    if (!charge.workspaceId) continue;
    const list = chargesByTeam.get(charge.workspaceId) ?? [];
    list.push(charge);
    chargesByTeam.set(charge.workspaceId, list);
  }

  const monthTotals = new Map<string, { chargeCount: number; baseKobo: number; commissionKobo: number }>();
  const teams: TeamLine[] = [];

  for (const team of input.teams) {
    const attachedMs = new Date(team.attachedAt).getTime();
    const counted = (chargesByTeam.get(team.workspaceId) ?? [])
      .filter((charge) => !charge.excluded && new Date(charge.chargedAt).getTime() >= attachedMs)
      .sort((a, b) => new Date(a.chargedAt).getTime() - new Date(b.chargedAt).getTime());

    if (counted.length === 0) {
      teams.push({
        workspaceId: team.workspaceId,
        name: team.name,
        attachedAt: team.attachedAt,
        firstChargeAt: null,
        windowEndsAt: null,
        chargeCount: 0,
        baseKobo: 0,
        commissionKobo: 0,
        earning: true,
      });
      continue;
    }

    const windowEnds = addMonthsUtc(new Date(counted[0].chargedAt), terms.commissionMonths);
    const inWindow = counted.filter((charge) => new Date(charge.chargedAt).getTime() < windowEnds.getTime());

    let base = 0;
    let commission = 0;
    for (const charge of inWindow) {
      const owed = commissionOnCharge(charge.amountKobo, terms.commissionBps);
      base += charge.amountKobo;
      commission += owed;
      const key = lagosMonth(charge.chargedAt);
      const bucket = monthTotals.get(key) ?? { chargeCount: 0, baseKobo: 0, commissionKobo: 0 };
      bucket.chargeCount += 1;
      bucket.baseKobo += charge.amountKobo;
      bucket.commissionKobo += owed;
      monthTotals.set(key, bucket);
    }

    teams.push({
      workspaceId: team.workspaceId,
      name: team.name,
      attachedAt: team.attachedAt,
      firstChargeAt: counted[0].chargedAt,
      windowEndsAt: windowEnds.toISOString(),
      chargeCount: inWindow.length,
      baseKobo: base,
      commissionKobo: commission,
      earning: now.getTime() < windowEnds.getTime(),
    });
  }

  const payoutByMonth = new Map<string, PayoutRecord>();
  for (const payout of input.payouts) payoutByMonth.set(payout.month, payout);

  const allMonths = new Set<string>([...monthTotals.keys(), ...payoutByMonth.keys()]);
  const months: MonthLine[] = [...allMonths]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((month) => {
      const totals = monthTotals.get(month) ?? { chargeCount: 0, baseKobo: 0, commissionKobo: 0 };
      const payout = payoutByMonth.get(month) ?? null;
      const paid = payout ? payout.amountKobo : 0;
      const outstanding = Math.max(totals.commissionKobo - paid, 0);
      return {
        month,
        chargeCount: totals.chargeCount,
        baseKobo: totals.baseKobo,
        commissionKobo: totals.commissionKobo,
        paidKobo: payout ? payout.amountKobo : null,
        paidAt: payout ? payout.paidAt : null,
        outstandingKobo: outstanding,
        overpaidKobo: Math.max(paid - totals.commissionKobo, 0),
        dueOn: payoutDueDate(month),
        overdue: outstanding > 0 && isPastDue(month, now),
      };
    });

  const totalCommission = months.reduce((sum, line) => sum + line.commissionKobo, 0);
  const totalPaid = months.reduce((sum, line) => sum + (line.paidKobo ?? 0), 0);
  const totalOutstanding = months.reduce((sum, line) => sum + line.outstandingKobo, 0);

  return {
    teams: teams.sort((a, b) => (a.attachedAt < b.attachedAt ? 1 : -1)),
    months,
    totalCommissionKobo: totalCommission,
    totalPaidKobo: totalPaid,
    totalOutstandingKobo: totalOutstanding,
  };
}

// --------------------------------------------------------------- admin actions

export type ReferralAdminAction =
  | { type: 'create_partner'; name: string; code: string; contactEmail: string | null }
  | { type: 'set_partner_active'; partnerId: string; active: boolean }
  | { type: 'attach_team'; code: string; ownerEmail: string }
  | { type: 'exclude_charge'; reference: string; reason: string }
  | { type: 'restore_charge'; reference: string }
  | { type: 'record_payout'; partnerId: string; month: string; amountKobo: number; note: string | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Kobo in an integer column holds well past any commission this will see. */
const MAX_PAYOUT_KOBO = 1_000_000_000;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

export function parseReferralAdminAction(
  body: unknown
): { ok: true; action: ReferralAdminAction } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send a JSON body.' };
  const record = body as Record<string, unknown>;

  switch (record.type) {
    case 'create_partner': {
      const name = text(record.name, 120);
      if (!name) return { ok: false, error: 'Give the partner a name (up to 120 characters).' };
      const code = normalizeReferralCode(record.code);
      if (!code) {
        return { ok: false, error: 'The code needs 3 to 40 letters, numbers, hyphens or underscores.' };
      }
      let contactEmail: string | null = null;
      if (record.contactEmail !== undefined && record.contactEmail !== null && record.contactEmail !== '') {
        const email = text(record.contactEmail, 200);
        if (!email || !EMAIL_PATTERN.test(email)) return { ok: false, error: 'That contact email does not look right.' };
        contactEmail = email.toLowerCase();
      }
      return { ok: true, action: { type: 'create_partner', name, code, contactEmail } };
    }
    case 'set_partner_active': {
      const partnerId = typeof record.partnerId === 'string' ? record.partnerId : '';
      if (!UUID_PATTERN.test(partnerId)) return { ok: false, error: 'Pick a partner.' };
      if (typeof record.active !== 'boolean') return { ok: false, error: 'Say whether the partner is active.' };
      return { ok: true, action: { type: 'set_partner_active', partnerId, active: record.active } };
    }
    case 'attach_team': {
      const code = normalizeReferralCode(record.code);
      if (!code) return { ok: false, error: 'That is not a valid referral code.' };
      const ownerEmail = text(record.ownerEmail, 200);
      if (!ownerEmail || !EMAIL_PATTERN.test(ownerEmail)) {
        return { ok: false, error: 'Enter the email of the person who owns the team.' };
      }
      return { ok: true, action: { type: 'attach_team', code, ownerEmail: ownerEmail.toLowerCase() } };
    }
    case 'exclude_charge': {
      const reference = text(record.reference, 200);
      if (!reference) return { ok: false, error: 'Name the payment to exclude.' };
      const reason = text(record.reason, 300);
      if (!reason) return { ok: false, error: 'Say why, for example "refunded on 12 Nov".' };
      return { ok: true, action: { type: 'exclude_charge', reference, reason } };
    }
    case 'restore_charge': {
      const reference = text(record.reference, 200);
      if (!reference) return { ok: false, error: 'Name the payment to restore.' };
      return { ok: true, action: { type: 'restore_charge', reference } };
    }
    case 'record_payout': {
      const partnerId = typeof record.partnerId === 'string' ? record.partnerId : '';
      if (!UUID_PATTERN.test(partnerId)) return { ok: false, error: 'Pick a partner.' };
      const month = typeof record.month === 'string' ? record.month : '';
      if (!MONTH_PATTERN.test(month)) return { ok: false, error: 'The month must look like 2026-11.' };
      const naira = Number(record.amountNaira);
      if (!Number.isFinite(naira) || naira < 0) return { ok: false, error: 'Enter the amount paid, in naira.' };
      const amountKobo = Math.round(naira * 100);
      if (amountKobo > MAX_PAYOUT_KOBO) return { ok: false, error: 'That amount is too large.' };
      const note = record.note === undefined || record.note === null || record.note === '' ? null : text(record.note, 300);
      if (record.note && !note) return { ok: false, error: 'The note is too long.' };
      return { ok: true, action: { type: 'record_payout', partnerId, month, amountKobo, note } };
    }
    default:
      return { ok: false, error: 'Unknown action.' };
  }
}
