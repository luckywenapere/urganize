import { creditAccount, type TeamForAllowance } from './allowance';

/**
 * Who may use UrgAns without a plan: the pure decisions. The founder's rule
 * (2026-10-02): a team that is walled (its trial ended) or read-only (its plan
 * lapsed) can still use UrgAns, changes included, paying in credits. The server
 * half is app/api/_shared/urgans-access.ts; the pass that lets the assistant's
 * own tool calls through the paywall is lib/urgans-pass.ts.
 *
 * Kept here, with no imports beyond its sibling, so every rule is tested without
 * a mock and the credit guard can confirm it never reaches a database.
 */

/** What the paywall gate said when it refused a request. */
export type PaywallRefusal = { status: number; code?: unknown };

/**
 * The two ways the gate refuses a team for lack of a plan: 402 (walled) and the
 * read-only 403, which carries READ_ONLY_REFUSAL_CODE. Anything else (a 401, a
 * curator's 403, a missing server setting) is NOT a paywall refusal and must never
 * be admitted past: those are failures of a different kind.
 *
 * `readOnlyCode` is passed in rather than imported so this module stays pure.
 */
export function isPaywallRefusal(refusal: PaywallRefusal, readOnlyCode: string): boolean {
  if (refusal.status === 402) return true;
  return refusal.status === 403 && refusal.code === readOnlyCode;
}

export type AdmissionInput = {
  creditsEnabled: boolean;
  refusal: PaywallRefusal;
  readOnlyCode: string;
  team: (TeamForAllowance & { primaryWorkspaceId?: string | null }) | undefined;
};

/**
 * Whether a request the gate refused should be let through to UrgAns anyway.
 * Yes only when ALL of these hold: credits are switched on; the refusal really
 * was the paywall; the person has a team; and that team is a credits-only
 * account by the credit rules (so it is not simply a paying team the gate
 * misjudged, and not a trial, which is let in by the gate itself).
 *
 * It does not look at the balance. The metered routes check that themselves and
 * answer in their own words; the routes that cost nothing (a person's own saved
 * chats, the usage line) are fine for a credits-only team with no credits left.
 */
export function shouldAdmitCreditsOnly(input: AdmissionInput): boolean {
  if (!input.creditsEnabled) return false;
  if (!isPaywallRefusal(input.refusal, input.readOnlyCode)) return false;
  if (!input.team?.primaryWorkspaceId) return false;
  return creditAccount(input.team) === 'credits_only';
}
