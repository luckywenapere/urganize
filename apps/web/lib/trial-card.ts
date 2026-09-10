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

// ─────────────────────────────────────────────────────────────────────────────
// Why a card-trial setup failed, in the only two shapes a user can act on
// ─────────────────────────────────────────────────────────────────────────────
//
// failTrialCardCharge writes one of three reasons into
// payments.paystack_response.failure_reason: 'card_not_reusable',
// 'subscription_create_failed', 'plan_unresolvable'. Exactly ONE of those is
// about the customer's card. The other two are our side — a Paystack plan code
// that is missing, stale, or from the wrong Paystack mode — and telling someone
// to "try a different card" for those sends them round a loop that cannot
// succeed however many cards they own. That is what this classifier exists to
// stop.
//
// COARSE ON PURPOSE, and this is the load-bearing bit: the value crosses
// /api/payments/verify, which is an UNAUTHENTICATED route keyed on a
// query-string reference. So it is an allowlist of two classifications rather
// than the stored reason, and `failure_detail` (which can carry a Paystack
// message) never leaves the server at all — the lib/upload-failure-report.ts
// posture, for the same reason: a string designed to be read by a stranger has
// to be safe to hand a stranger.
//
// An unknown reason classifies as 'setup', not 'card'. A reason we do not
// recognise is not evidence the customer did anything wrong.

export type TrialCardFailureKind = 'card' | 'setup';

/** The one reason that genuinely means "this card cannot be billed later". */
const CARD_FAILURE_REASON = 'card_not_reusable';

export function classifyTrialCardFailure(
  reason: string | null | undefined
): TrialCardFailureKind {
  return String(reason ?? '').trim() === CARD_FAILURE_REASON ? 'card' : 'setup';
}

/** The copy each kind earns. 'setup' deliberately does NOT say "try a
 * different card": nothing about the card is wrong, retrying is futile, and
 * the honest next step is to reach us. */
export function describeTrialCardFailure(kind: TrialCardFailureKind): string {
  return kind === 'card'
    ? "That card can't be saved for future billing, so we can't start a trial on it. The ₦100 check is refunded automatically — try a different card."
    : "Your card is fine and the ₦100 check is refunded automatically — this one is on us. Something went wrong setting up the trial itself, so retrying with another card won't help. Email contact@urganize.app and we'll sort it out.";
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
 * Note this drives the login-time bounce (auth-store) and the in-session gate
 * (CardTrialGate, via /api/subscription-status's cardTrialRequired). The
 * /start-trial page itself deliberately does NOT key on it: onboarding sends
 * brand-new signups there under the flag alone, and gating the page on the
 * cutoff too would make a flag-on/cutoff-unset deploy silently bounce them
 * straight back to the dashboard.
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

// ---------------------------------------------------------------------------
// In-session gate (components/providers/CardTrialGate.tsx) — pure halves.
//
// Why it exists: the login-time bounce above only fires on FULL page loads,
// and both signup funnels finish with client-side navigations while the
// current pathname is still a safe auth path (so the bounce early-returns):
//   - /auth/callback runs checkAuth on /auth/callback (a /auth safe path),
//     then router.replace()s to the dashboard — a new Google signup lands in
//     the app with no billing surface for the whole SPA session.
//   - /auth email login races the same way: checkAuth's fetch usually
//     resolves while the pathname is still /auth.
//   - Back from /start-trial → /onboarding → its authenticated redirect →
//     dashboard is three SPA hops with no full load anywhere.
// The gate closes those by consulting the server-computed cardTrialRequired
// whenever a gated chrome path is reached in-session. Everything here is pure
// so the decision is unit-testable; the component owns only the fetch and the
// redirect.
// ---------------------------------------------------------------------------

/** The chrome-bearing app surfaces the in-session gate covers. Deliberately
 * NOT /curator (the curator side is free by design), not the public token
 * pages (/epk, /credits, /capture), and not the auth/billing surfaces
 * (/auth, /onboarding, /start-trial, /locked, /payment, /redeem, /invite) —
 * bouncing those would loop or eat a flow mid-step. */
const CARD_TRIAL_GATED_PATH_PREFIXES = ['/dashboard', '/settings', '/admin'] as const;

export function isCardTrialGatedPath(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? '');
  return CARD_TRIAL_GATED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

/** Where a card-owing account belongs. An account that has never finished
 * onboarding has had no dopamine hit yet — it created no release and saw no
 * plan — so billing-first would wall it cold. Sending it through the wizard
 * first means EVERY funnel reads the same: questions → their release and its
 * plan → billing → the app. Google signups from /auth are the ones this
 * exists for: nothing routed them through onboarding, unlike the email
 * funnel, which starts there. */
export const ONBOARDING_SETUP_PATH = '/onboarding?setup=1';

export function resolveCardTrialDestination(
  onboardingCompleted: boolean | null | undefined
): string {
  // Unknown (a degraded read) → /start-trial: the same destination the flow
  // has always used, and the wizard's own guard would bounce a
  // finished-onboarding account straight back out anyway.
  return onboardingCompleted === false ? ONBOARDING_SETUP_PATH : '/start-trial';
}

/** The last /api/subscription-status answer this tab holds, keyed by the user
 * id AT ANSWER TIME. `required: false` is cacheable for the rest of the tab's
 * life because the predicate is one-way for a given account: every state that
 * makes it false (paid, trialing, trial used, pre-cutoff creation, teammate
 * membership, curator role) never transitions back to required=true — see
 * resolveCardTrialRequirement. `required: true` is deliberately NOT treated
 * as settled: the gate re-asks on every gated entry so a checkout completed
 * on /start-trial clears it without a full reload. */
export type CardTrialGateAnswer = { userId: string; required: boolean } | null;

export type CardTrialGateInput = {
  /** NEXT_PUBLIC_FEATURE_CARD_TRIAL resolved by the caller. */
  enabled: boolean;
  pathname: string | null | undefined;
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  userId: string | null | undefined;
  /** Client-side role read — curator-only accounts never see team billing.
   * A stale/fallback role fails open server-side anyway. */
  role: string | null | undefined;
  /** isAllowlistedEmail(user.email) resolved by the caller — the same
   * fast path the login bounce takes, saving the round trip. */
  allowlisted: boolean;
  lastAnswer: CardTrialGateAnswer;
};

/**
 * Should the in-session gate consult /api/subscription-status right now?
 * Fail-open discipline throughout (the resolveCardTrialRequirement doctrine):
 * a `true` here only triggers a server read whose answer decides the
 * redirect — never a redirect by itself.
 */
export function shouldConsultCardTrialGate(input: CardTrialGateInput): boolean {
  if (!input.enabled) return false;
  if (!isCardTrialGatedPath(input.pathname)) return false;
  if (input.isAuthLoading || !input.isAuthenticated) return false;

  const userId = String(input.userId ?? '').trim();
  if (!userId) return false;

  const role = String(input.role ?? '').trim().toLowerCase();
  if (role === 'curator') return false;
  if (input.allowlisted) return false;

  if (
    input.lastAnswer &&
    input.lastAnswer.userId === userId &&
    input.lastAnswer.required === false
  ) {
    return false;
  }

  return true;
}

/**
 * Should /onboarding run in AUTHED-SETUP mode — i.e. serve the wizard to an
 * account that is already signed in but has never finished it, instead of
 * bouncing it home?
 *
 * Normally being signed in on /onboarding means "you already have an account,
 * go to the app" (the wizard's redirect effect). Authed-setup is the narrow
 * exception the card-trial funnel needs: a fresh Google signup from /auth is
 * authenticated but un-onboarded, and it must get the questions + its first
 * release BEFORE billing. Requires the marker param, so a normal /onboarding
 * visit is completely unaffected.
 *
 * Gated on the flag too: with card-trial off, nothing routes anyone here with
 * the param, and honoring it anyway would let a stale bookmark strand an
 * onboarded user in a wizard whose finish line is a page that redirects home.
 */
export function shouldRunAuthedOnboardingSetup(input: {
  enabled: boolean;
  /** Whether ?setup=1 is present — read imperatively by the caller. The
   * wizard must NOT call useSearchParams: that un-server-renders this page,
   * the front-door bug of 2026-08-13. */
  hasSetupParam: boolean;
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  /** profiles.onboarding_completed from the auth store. */
  onboardingCompleted: boolean | null | undefined;
  role: string | null | undefined;
}): boolean {
  if (!input.enabled) return false;
  if (!input.hasSetupParam) return false;
  if (input.isAuthLoading || !input.isAuthenticated) return false;
  // Only an explicit false qualifies: undefined means the profile has not
  // loaded (or the field is missing), and assuming "not onboarded" there
  // would re-run the wizard for someone who already finished it.
  if (input.onboardingCompleted !== false) return false;
  if (String(input.role ?? '').trim().toLowerCase() === 'curator') return false;
  return true;
}
