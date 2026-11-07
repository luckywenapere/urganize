/**
 * After New project (#854): where onboarding lands, and when the trial sheet
 * opens there. The paywall moved here from before the first plan: value
 * first, then "Your 3-day trial is on", a sheet you can close.
 *
 * When it opens (spec S5):
 *  - a rollout with a date: when its plan has landed, or after 45 seconds;
 *  - a rollout with no date: once the planner's questions are answered and the
 *    plan starts building (never over the questions), or after 60 seconds if
 *    the planner was never opened;
 *  - a record in the making: 8 seconds after landing on it;
 *  - Skip for now: on the first Home visit.
 * Never while the planner's questions are open, and never for someone who
 * joined another person's team (the owner pays).
 *
 * One record in localStorage per user, written when New project finishes,
 * cleared once the sheet has been seen. Pure rules and storage wrappers that
 * never throw, so vitest holds the timing.
 */

import {
  INTRO_MONTHS,
  PRICING_TIERS,
  formatTierPrice,
  getIntroPrice,
  type PricingTierId,
} from '@urganize/pricing';
import type { TeamWhoFor } from './onboarding-flow';

export const ONBOARDING_LANDING_KEY = 'urganize.onboarding.landing';

export type OnboardingLandingKind = 'rollout_dated' | 'rollout_nodate' | 'record' | 'skipped' | 'joined';

export type OnboardingLanding = {
  v: 1;
  userId: string;
  kind: OnboardingLandingKind;
  releaseId?: string;
  /** Who the team is for, to pick the plan the sheet shows. */
  whoFor?: TeamWhoFor;
  /** For "You're in {team}." on Home after joining. */
  teamName?: string;
  /** Ask "how did you hear about Urganize?" while this rollout's plan builds. */
  askHeardFrom?: boolean;
  at: number;
};

/** A landing older than this is about a moment long gone. */
export const LANDING_MAX_MS = 24 * 60 * 60 * 1000;
export const DATED_SHEET_AFTER_MS = 45_000;
export const NODATE_SHEET_FALLBACK_MS = 60_000;
export const RECORD_SHEET_AFTER_MS = 8_000;
export const HOME_SHEET_AFTER_MS = 1_500;

const KINDS: ReadonlySet<string> = new Set(['rollout_dated', 'rollout_nodate', 'record', 'skipped', 'joined']);

export function parseOnboardingLanding(raw: string | null, now: number): OnboardingLanding | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OnboardingLanding> | null;
    if (!value || value.v !== 1 || typeof value.userId !== 'string' || !value.userId) return null;
    if (typeof value.kind !== 'string' || !KINDS.has(value.kind)) return null;
    if (typeof value.at !== 'number' || now - value.at > LANDING_MAX_MS || now < value.at - 60_000) return null;
    return {
      v: 1,
      userId: value.userId,
      kind: value.kind as OnboardingLandingKind,
      ...(typeof value.releaseId === 'string' && value.releaseId ? { releaseId: value.releaseId } : {}),
      ...(value.whoFor === 'artist' || value.whoFor === 'manager' || value.whoFor === 'label' ? { whoFor: value.whoFor } : {}),
      ...(typeof value.teamName === 'string' && value.teamName ? { teamName: value.teamName.slice(0, 120) } : {}),
      ...(value.askHeardFrom === true ? { askHeardFrom: true } : {}),
      at: value.at,
    };
  } catch {
    return null;
  }
}

export type TrialSheetInput = {
  landing: OnboardingLanding;
  /** Where the person is now. */
  place: { onHome: boolean; releaseId: string | null; onRecord: boolean };
  /** How long they have been on the landing place. */
  elapsedMs: number;
  plannerOpen: boolean;
  plannerWasOpened: boolean;
  planBuilding: boolean;
  planLanded: boolean;
};

/** 'open' now, 'wait' and ask again, or 'none' (nothing to show here). */
export function decideTrialSheet(input: TrialSheetInput): 'open' | 'wait' | 'none' {
  const { landing, place, elapsedMs } = input;
  if (landing.kind === 'joined') return 'none';
  // Never over the planner's questions: that would hide what they came for.
  if (input.plannerOpen) return 'wait';
  if (landing.kind === 'skipped') {
    if (!place.onHome) return 'none';
    return elapsedMs >= HOME_SHEET_AFTER_MS ? 'open' : 'wait';
  }
  if (landing.kind === 'record') {
    if (!place.onRecord) return 'none';
    return elapsedMs >= RECORD_SHEET_AFTER_MS ? 'open' : 'wait';
  }
  if (!landing.releaseId || place.releaseId !== landing.releaseId) return 'none';
  if (landing.kind === 'rollout_dated') {
    return input.planLanded || elapsedMs >= DATED_SHEET_AFTER_MS ? 'open' : 'wait';
  }
  // No date: after the questions, once the plan starts building.
  if (input.planBuilding || input.planLanded) return 'open';
  if (!input.plannerWasOpened && elapsedMs >= NODATE_SHEET_FALLBACK_MS) return 'open';
  return 'wait';
}

// ── The plan the sheet recommends ────────────────────────────────────────────

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const numberWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

/** "One artist, you and two others." / "Up to 3 artists and 5 people." Read from the plan's limits. */
export function planLimitLines(tier: PricingTierId): string[] {
  const { artists, seats, activeReleases } = PRICING_TIERS[tier].limits;
  const lines: string[] = [];
  if (artists === 1 && seats !== null && seats > 1) {
    const others = seats - 1;
    lines.push(`One artist, you and ${others === 1 ? 'one other person' : `${numberWord(others).toLowerCase()} others`}.`);
  }
  else if (artists !== null && seats !== null) {
    lines.push(`Up to ${artists} ${artists === 1 ? 'artist' : 'artists'} and ${seats} ${seats === 1 ? 'person' : 'people'}.`);
  }
  if (activeReleases !== null) {
    lines.push(`${numberWord(activeReleases)} ${activeReleases === 1 ? 'rollout' : 'rollouts'} at a time.`);
  }
  return lines;
}

/** Just me → Solo; artists I manage or a label → Manager (Label is call-led and never shown here). */
export function trialSheetTier(whoFor: TeamWhoFor | null | undefined): PricingTierId {
  return whoFor === 'artist' ? 'solo' : 'manager';
}

export type TrialSheetPlan = {
  tier: PricingTierId;
  name: string;
  /** What a month costs now: the starting price when there is one. */
  price: string;
  /** "for your first 6 months, then ₦5,000/month", or null. */
  then: string | null;
  lines: string[];
};

const naira = (amount: number): string =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);

/** The plan card, priced the way the billing wall prices it (starting price first). */
export function trialSheetPlan(whoFor: TeamWhoFor | null | undefined): TrialSheetPlan {
  const tier = trialSheetTier(whoFor);
  const intro = getIntroPrice(tier);
  const full = formatTierPrice(tier, 'monthly') ?? '';
  return {
    tier,
    name: PRICING_TIERS[tier].label,
    price: intro ? `${naira(intro.amount)}/month` : full,
    then: intro ? `for your first ${INTRO_MONTHS} months, then ${full}` : null,
    lines: planLimitLines(tier),
  };
}

// ── Storage (never throws) ───────────────────────────────────────────────────

export function writeOnboardingLanding(landing: Omit<OnboardingLanding, 'v' | 'at'>, now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ONBOARDING_LANDING_KEY, JSON.stringify({ v: 1, ...landing, at: now }));
  } catch {
    // Blocked storage: no sheet, and the billing wall still asks when the trial ends.
  }
}

export function readOnboardingLanding(userId: string | null | undefined, now: number = Date.now()): OnboardingLanding | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const landing = parseOnboardingLanding(window.localStorage.getItem(ONBOARDING_LANDING_KEY), now);
    return landing && landing.userId === userId ? landing : null;
  } catch {
    return null;
  }
}

export function updateOnboardingLanding(patch: Partial<Pick<OnboardingLanding, 'askHeardFrom' | 'kind'>>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_LANDING_KEY);
    if (!raw) return;
    window.localStorage.setItem(ONBOARDING_LANDING_KEY, JSON.stringify({ ...JSON.parse(raw), ...patch }));
  } catch {
    // Nothing to update in a store that cannot be written.
  }
}

export function clearOnboardingLanding(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ONBOARDING_LANDING_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** WorkspaceView tells the trial sheet when an auto-built plan has landed. */
export const PLAN_LANDED_EVENT = 'urganize:plan-landed';
