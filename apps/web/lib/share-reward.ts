import { isSocialShareEnabled } from '@/lib/social-share';
import { computeExtendedTrialEnd, type TeamAccessResolution } from '@/lib/team-billing';

/**
 * One month free for sharing the rollout (founder call, 2026-10-11).
 *
 * The share-to-socials sheet offers it: the FIRST time an owner or admin taps
 * any share, copy, save or send button in the sheet, their team gets 30 days
 * free. A tap is enough (honor system): nobody can see whether a post actually
 * went up, and the founder chose generosity over proof.
 *
 * Once per team, ever, enforced on the server by `workspaces.share_reward_claimed_at`
 * (a conditional update, so two taps on two phones cannot both win).
 *
 * HOW THE MONTH IS GIVEN depends on the team's state, and this module is the
 * one place that decides it (`decideShareReward`):
 *
 *  - A team on its trial, or with no access of its own (walled, read-only,
 *    credits-only, an unstamped trial): `workspaces.trial_ends_at` moves to
 *    max(now, current end) + 30 days, the same arithmetic as the admin
 *    "extend trial" action. A trial outranks read-only and credits-only in
 *    resolveTeamAccess, so this is full access for 30 days in every one of
 *    those states.
 *  - A PAYING team: `workspaces.paid_bonus_days` gains 30. resolveTeamAccess
 *    treats the days after the owner's paid period (subscriptions.expires_at)
 *    as paid access, so the month is added onto the END of whatever they paid
 *    for. Paystack is never touched: the next charge happens on its own
 *    schedule, and because a renewal advances expires_at from its current
 *    value, the month rides along behind every renewal and is used when the
 *    team stops paying. Nothing is double charged and no renewal can break.
 *    See "Reward the first-rollout share" in CLAUDE.md for why pushing
 *    expires_at itself was rejected.
 *  - A comped or allowlisted team already has free access: no offer.
 *
 * Copy rules: in-app copy says "rollout". The offer never reaches anything a
 * fan reads; the captions and posters in lib/social-share.ts know nothing of it.
 */

/** How much a share is worth. */
export const SHARE_REWARD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Feature switch. ON BY DEFAULT, deliberately breaking this repo's
 * "flags start off" rule (the invite gate precedent): the founder asked for it
 * live, and a NEXT_PUBLIC_* flag needs a Vercel env save plus a rebuild.
 * Kill switch: NEXT_PUBLIC_FEATURE_SHARE_REWARD=false in Vercel Web, then
 * redeploy. It also rides the share sheet's own flag: no sheet, no offer.
 */
export const isShareRewardEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_SHARE_REWARD !== 'false' && isSocialShareEnabled();

/** What the offer line says on the sheet. */
export const SHARE_REWARD_OFFER = 'Share your rollout and get 1 month free';

/** The pullout behind the offer's info icon. */
export const SHARE_REWARD_OFFER_DETAIL =
  'Tap any share, copy or save button in this sheet and we add 30 free days for your team. One free month per team.';

/** How a team's access is described to the claim decision. */
export type ShareRewardAccess = Pick<TeamAccessResolution, 'state' | 'reason'>;

export type ShareRewardDecision =
  /** Already claimed once. Nothing changes. */
  | { kind: 'already_claimed' }
  /** Free access already (comped, allowlisted). Nothing to give. */
  | { kind: 'not_needed' }
  /** Move workspaces.trial_ends_at to `trialEndsAt`. */
  | { kind: 'trial_extended'; trialEndsAt: string; accessUntil: string }
  /** Set workspaces.paid_bonus_days to `paidBonusDays`. `accessUntil` is null
   *  when the owner's paid period has no end date (a legacy paid account),
   *  which still records the claim and simply has no date to show. */
  | { kind: 'paid_bonus'; paidBonusDays: number; accessUntil: string | null };

/**
 * Does this team see the offer? Owner or admin only (they are the ones who can
 * act on billing, the wall's own rule), not claimed yet, and a team whose
 * access is not already free.
 */
export function isShareRewardEligible(input: {
  enabled: boolean;
  isOwnerOrAdmin: boolean;
  claimedAt: string | null;
  access: ShareRewardAccess;
  hasRealRollout: boolean;
}): boolean {
  if (!input.enabled) return false;
  if (!input.isOwnerOrAdmin) return false;
  if (input.claimedAt) return false;
  if (!input.hasRealRollout) return false;
  return !alreadyFree(input.access);
}

function alreadyFree(access: ShareRewardAccess): boolean {
  return access.state === 'comped' || access.reason === 'owner_allowlisted';
}

/**
 * Where the month goes. Pure: the route reads the rows, this decides, the
 * route writes. `ownerPaid` means the owner's subscription snapshot says PAID
 * (accountStatus 'paid'), not merely "has access": an owner whose access is a
 * per-account trial is treated like a trialing team.
 */
export function decideShareReward(input: {
  claimedAt: string | null;
  access: ShareRewardAccess;
  ownerPaid: boolean;
  /** subscriptions.expires_at of the owner, when paid. */
  ownerPaidThrough: string | null;
  /** The owner's own per-account trial end, if one is running. The new team
   *  trial is extended from the later of this and the team's own end, so the
   *  month is never swallowed by a trial that was going to last longer anyway. */
  ownerTrialEndsAt?: string | null;
  teamTrialEndsAt: string | null;
  paidBonusDays: number | null;
  now?: Date;
}): ShareRewardDecision {
  const now = input.now ?? new Date();
  if (input.claimedAt) return { kind: 'already_claimed' };
  if (alreadyFree(input.access)) return { kind: 'not_needed' };

  if (input.access.state === 'paid' && input.access.reason === 'owner_paid' && input.ownerPaid) {
    const paidBonusDays = Math.max(0, input.paidBonusDays ?? 0) + SHARE_REWARD_DAYS;
    const through = parseMs(input.ownerPaidThrough);
    const accessUntil =
      through === null ? null : new Date(through + paidBonusDays * DAY_MS).toISOString();
    return { kind: 'paid_bonus', paidBonusDays, accessUntil };
  }

  const teamEnd = parseMs(input.teamTrialEndsAt);
  const ownerEnd = parseMs(input.ownerTrialEndsAt ?? null);
  const latest = [teamEnd, ownerEnd].filter((value): value is number => value !== null);
  const base = latest.length > 0 ? new Date(Math.max(...latest)).toISOString() : null;
  const trialEndsAt = computeExtendedTrialEnd(base, SHARE_REWARD_DAYS, now).toISOString();
  return { kind: 'trial_extended', trialEndsAt, accessUntil: trialEndsAt };
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** "November 10, 2026", the app's own long date shape. Empty for a bad date. */
export function formatShareRewardDate(iso: string | null | undefined): string {
  const ms = parseMs(iso);
  if (ms === null) return '';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** What the sheet says once the month is added. */
export function shareRewardConfirmation(accessUntil: string | null | undefined): string {
  const date = formatShareRewardDate(accessUntil);
  return date
    ? `1 month free added. Your team now has access until ${date}.`
    : '1 month free added to your team.';
}
