// Card-before-trial (NEXT_PUBLIC_FEATURE_CARD_TRIAL) — pure, client-safe logic.
//
// The flow this supports (see the CLAUDE.md working-notes entry):
//   onboarding → /start-trial → POST /api/trial/start-checkout reserves a
//   payments row (plan = TRIAL_CARD_PLAN) and sends the user to Paystack for a
//   small card-verification charge (channels: ['card']) → the charge.success
//   webhook claims the row, requires a REUSABLE authorization, creates a
//   Paystack subscription whose start_date is the trial end (so the card is
//   only billed when the trial lapses), refunds the verification charge, and
//   writes subscriptions.status = 'trialing' + the profile trial fields.
//
// Everything here is pure (no I/O, no React): the checkout route, the webhook
// and the client pages all import from this one module so amounts, sentinels
// and the gate predicate cannot drift between them. Deliberately does NOT
// import app/api/releases/_shared.ts — new modules use the canonical helpers
// in app/api/_shared/auth.ts and must not touch the deprecated schema-missing
// fallback surface (see lib/schema-fallback-guard.test.ts).

/** One shared trial length. /api/trial/start (the no-card path) and the card
 * flow both import this, so the two can never disagree about what "the trial"
 * is. 28 days is load-bearing copy: /terms, the /pricing FAQ and the locked
 * page all say 28. */
export const TRIAL_DAYS = 28;

/** Sentinel written to payments.plan for the card-verification charge —
 * successor to the deleted card-on-file flow's 'trial_claim'. payments.plan is
 * free text (no CHECK constraint), and this value is deliberately NOT a
 * BillingPlanId so the webhook's recurring/legacy crediting paths can never
 * mistake a ₦100 card check for a purchase. account/delete-now preserves rows
 * carrying it through account deletion (the anti-trial-reclaim ledger). */
export const TRIAL_CARD_PLAN = 'trial_card';

/** Tag written into payments.paystack_response.source and the Paystack init
 * metadata.source so support tooling can tell these charges apart. */
export const TRIAL_CARD_SOURCE = 'trial_card_checkout';

/** Display-only constant for page copy ("We place a ₦100 card check…").
 * The server amount comes from resolveTrialVerificationKobo() below — if the
 * TRIAL_CARD_VERIFICATION_AMOUNT_NGN env override is ever used, update the
 * copy that renders this constant to match. */
export const TRIAL_CARD_VERIFICATION_DISPLAY_NGN = 100;

/** Feature switch. Function form (the isEpkFeatureEnabled precedent) so it
 * works both inlined into client bundles and at request time on the server. */
export const isCardTrialEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_CARD_TRIAL === 'true';

/** The plans a card-backed trial can convert into. 'label' is contactSales
 * (no self-serve checkout) and is deliberately excluded. */
export type CardTrialPlanId = 'monthly' | 'annual';

export function isCardTrialPlan(value: unknown): value is CardTrialPlanId {
  return value === 'monthly' || value === 'annual';
}

/** Trial end = now + TRIAL_DAYS. Used both for profiles.trial_ends_at and as
 * the Paystack subscription's start_date (the first debit). */
export function computeTrialEnd(now: Date): Date {
  return new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Parse TRIAL_CARD_VERIFICATION_AMOUNT_NGN (naira) into the kobo amount sent
 * to Paystack. The unit trap this function exists to own: env is NAIRA,
 * Paystack wants KOBO (×100).
 *
 * Paystack's documented minimum for a tokenizing card charge is ₦50 (lower is
 * not guaranteed across card brands), so a positive value is clamped up to 50.
 * Anything unset/unparseable/non-positive falls back to ₦100 — the safe norm —
 * rather than clamping garbage to the minimum.
 */
export function resolveTrialVerificationKobo(raw: string | undefined): number {
  const parsed = Number(String(raw ?? '').trim());
  const naira =
    Number.isFinite(parsed) && parsed > 0 ? Math.max(50, parsed) : 100;
  return Math.round(naira * 100);
}

export type ReusableAuthorization = {
  authorizationCode: string;
  signature: string | null;
  raw: Record<string, unknown>;
};

/**
 * Validate the `authorization` object on a Paystack charge.success payload.
 * Returns null unless the authorization is explicitly reusable AND carries an
 * authorization_code — the two things a delayed subscription needs. A
 * non-reusable authorization (some virtual/OTP cards) means the card cannot be
 * billed at trial end, so the whole flow must fail cleanly and let the user
 * retry with a different card.
 */
export function extractReusableAuthorization(
  auth: unknown
): ReusableAuthorization | null {
  if (!auth || typeof auth !== 'object') return null;
  const record = auth as Record<string, unknown>;
  if (record.reusable !== true) return null;
  const authorizationCode = String(record.authorization_code || '').trim();
  if (!authorizationCode) return null;
  const signature = String(record.signature || '').trim();
  return {
    authorizationCode,
    signature: signature || null,
    raw: record,
  };
}

export type DelayedSubscriptionPayload = {
  customer: string;
  plan: string;
  authorization: string;
  start_date: string;
};

/** Body for POST https://api.paystack.co/subscription — start_date is what
 * delays the first debit to trial end (Paystack's documented free-trial
 * mechanism). */
export function buildDelayedSubscriptionPayload(args: {
  customerCode: string;
  planCode: string;
  authorizationCode: string;
  startDate: Date;
}): DelayedSubscriptionPayload {
  return {
    customer: args.customerCode,
    plan: args.planCode,
    authorization: args.authorizationCode,
    start_date: args.startDate.toISOString(),
  };
}

export type CardTrialRequirementInput = {
  /** NEXT_PUBLIC_FEATURE_CARD_TRIAL resolved by the caller. */
  enabled: boolean;
  /** TRIAL_CARD_SIGNUP_CUTOFF (ISO). Accounts created before it are never
   * gated — the paywall has been off since 2026-07-23, so plenty of EXISTING
   * accounts sit at unpaid/never-trialed and must not suddenly be walled.
   * Unset/unparseable → the gate is inert. */
  cutoffIso: string | null | undefined;
  /** profiles.created_at for the account being evaluated. */
  createdAtIso: string | null | undefined;
  accountStatus: string | null | undefined;
  trialUsed: boolean | null | undefined;
  hasAccess: boolean | null | undefined;
  /** profiles.role — curator-only accounts never see team billing. */
  role: string | null | undefined;
  /** True when the account holds an active non-owner workspace_members row —
   * an invited teammate rides the workspace they were invited into and must
   * never be asked to pay for it. null = unknown (read failed) → fail open. */
  isWorkspaceMember: boolean | null;
};

/**
 * THE escapee-bounce predicate: should this signed-in account be redirected to
 * /start-trial? Mirrors the isFirstReleaseRequired doctrine — FAIL OPEN ON
 * EVERY UNCERTAINTY. A wrong `true` walls someone out of the product, so
 * anything short of positive proof of "new signup, no access, no trial yet,
 * not a teammate, not a curator" returns false.
 *
 * Note this drives only the login-time bounce (auth-store). The /start-trial
 * page itself deliberately does NOT key on it: onboarding sends brand-new
 * signups there under the flag alone, and gating the page on the cutoff too
 * would make a flag-on/cutoff-unset deploy silently bounce them straight back
 * to the dashboard.
 */
export function resolveCardTrialRequirement(
  input: CardTrialRequirementInput
): boolean {
  if (!input.enabled) return false;

  const cutoffMs = Date.parse(String(input.cutoffIso ?? ''));
  if (!Number.isFinite(cutoffMs)) return false;
  const createdAtMs = Date.parse(String(input.createdAtIso ?? ''));
  if (!Number.isFinite(createdAtMs)) return false;
  if (createdAtMs < cutoffMs) return false;

  if (input.accountStatus !== 'unpaid') return false;
  if (input.trialUsed !== false) return false;
  if (input.hasAccess !== false) return false;

  const role = String(input.role ?? '').trim().toLowerCase();
  if (role === 'curator') return false;

  if (input.isWorkspaceMember !== false) return false;

  return true;
}
