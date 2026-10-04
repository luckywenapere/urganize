'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Logo } from '@urganize/ui';
import {
  PRICING_TIER_ORDER,
  SALES_CONTACT_EMAIL,
  SALES_WHATSAPP_URL,
  DEFAULT_SELLING_INTERVAL,
  formatPlanCyclePrice,
  getPlan,
  getTier,
  type BillingInterval,
  type PricingTierId,
} from '@urganize/pricing';
import { AlertTriangle, CheckCircle2, MessageCircle } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';
import { isIOSApp, isNativePlatform } from '@/lib/platform';
import { openExternalUrl } from '@/lib/external-link';
import {
  getTeamAccessClient,
  type TeamAccessClientSnapshot,
} from '@/lib/team-billing-client';
import { isPricingV2Enabled } from '@/lib/entitlements';
import { TierPlanPicker } from '@/components/billing/TierPlanPicker';
import { WallUrgansCard } from '@/components/billing/WallUrgansCard';
import { describeWallSummary, type WallSummaryCounts } from '@/lib/wall-summary';

// The wall (NEXT_PUBLIC_FEATURE_HARD_PAYWALL). Rendered by /locked when the
// flag is on; the flag-off page is untouched beside it.
//
// TWO ACTIONS, EQUAL WEIGHT, and that is the whole design. A roster-sized deal
// closes over an invoice and a walkthrough, not a card form, so "Talk to us"
// gets the same visual weight as checkout rather than being a footnote under
// it. The founder reads a talk-to-us click as a warmer signal than a card
// attempt.
//
// COPY RULES for everything in this file: plain and confident, no guilt, no
// countdown pressure. Never the word "workspace" (founder call: it is not how
// these teams talk). No container or location metaphors. No em dashes. The
// headline states the fact and the line under it removes the fear that matters
// most, which is "have I lost my releases".
//
// Two variants:
//   owner  - the person who can actually pay: plan picker + talk to us.
//   member - everyone else: told plainly that their admin needs to act, with
//            one tap to ask them. Never shown a price, because paying is not
//            theirs to do and a picker they cannot use is just noise.

const PLAN_ORDER = ['annual', 'monthly'] as const;

const PRICING_V2 = isPricingV2Enabled();

/** The self-serve tiers the wall offers. A sales-led tier is absent on purpose:
 *  the full-weight "Talk to us" card beside the picker IS its path, and a radio
 *  that cannot check out would be a dead end sitting next to the real one.
 *  Exactly the reasoning that kept the legacy contactSales plan out of
 *  PLAN_ORDER above.
 *
 *  DERIVED, NOT LISTED, as of 2026-09-01 — and that is a fix rather than a
 *  tidy-up. This was a hand-written array, and it fell out of step the moment
 *  Solo became purchasable: checkout would have accepted a tier the wall never
 *  offered, so Solo would have been a price nobody could buy. It now falls out
 *  of the pricing package: a tier belongs here exactly when it is not
 *  `contactSales`, which is the same fact `isSelfServeTier` encodes on the
 *  checkout side. It also inherits the public page's order for free (cheapest
 *  first), so a visitor who compared tiers there meets the same ladder here.
 *
 *  Read from `contactSales` rather than importing `isSelfServeTier`
 *  deliberately: that lives in lib/billing-plans.ts, which is documented
 *  server-only Paystack config and has no business in a client bundle. The two
 *  definitions are held together by a test in lib/entitlements.test.ts
 *  ('the wall and checkout agree on which tiers are self-serve') rather than by
 *  a cross-boundary import.
 *
 *  Sales-led tiers drop out on their own, which is what we want: the
 *  full-weight "Talk to us" card beside this picker IS their path, and a radio
 *  that cannot check out would be a dead end sitting next to the real one. */
const WALL_TIERS: readonly PricingTierId[] = PRICING_TIER_ORDER.filter(
  (tier) => !getTier(tier).contactSales
);

/** Which tier a returning owner lands on. Solo, because it is the tier that
 *  carries `recommended` on the public page (moved here from Manager
 *  2026-09-09) — pre-selecting anything else would open the wall on a
 *  different plan than the one the pricing page just told them to pick. It
 *  must stay a member of WALL_TIERS, or the wall opens with nothing selected. */
const DEFAULT_TIER: PricingTierId = 'solo';

const VALUE_LINES = [
  // The second line carried "paid once a year" while annual was the only
  // interval on sale (2026-09-08 to 09-10). Both sell again, and the wall now
  // shows a toggle, so a line promising one of them would contradict the control
  // directly above it. The team-not-per-person half is the part that matters and
  // is unchanged.
  'Every rollout, task and file exactly where you left it.',
  'One price for your whole team, not per person.',
  'Cancel whenever you want, from settings.',
];

export function TeamWall() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);

  const [team, setTeam] = useState<TeamAccessClientSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');
  // Pricing v2 splits the one choice above into two: which tier, and how often.
  // Both are unused while the flag is off, and the legacy state above is unused
  // while it is on — kept side by side rather than overloaded, so a rollback is
  // one boolean and not a data migration in component state.
  const [selectedTier, setSelectedTier] = useState<PricingTierId>(DEFAULT_TIER);
  const [selectedInterval, setSelectedInterval] =
    useState<BillingInterval>(DEFAULT_SELLING_INTERVAL);
  // INTERVAL STATE IS BACK since 2026-09-10, when monthly went on sale again
  // alongside yearly. It was absent from 2026-09-08 while everything was billed
  // once a year, and `DEFAULT_SELLING_INTERVAL` is what it opens on. The field
  // has always been SENT on both requests — checkout and change-plan require it,
  // and it is what tells the webhook how far to set expires_at. What came back
  // is the toggle, not the field.
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  /** Set when a change completed without a redirect: a downgrade, or an upgrade
   *  too small to charge for. Both need saying out loud, because a button that
   *  goes quiet reads as a failure. */
  const [changeResult, setChangeResult] = useState<string | null>(null);
  // What is already theirs, in real numbers. Null until the lookup lands or when it
  // fails, and the wall then falls back to the generic reassurance.
  const [summaryLine, setSummaryLine] = useState<string | null>(null);
  const [notifyState, setNotifyState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [notifyError, setNotifyError] = useState<string | null>(null);

  // WHICH TIERS TO OFFER: the server's answer when it gave one, our own
  // derivation otherwise.
  //
  // The server knows something this bundle cannot — whether each tier's Paystack
  // Plan has actually been minted — so it filters out any tier that would fail
  // at the last step of checkout. That is what stops a customer clicking a price
  // we cannot charge, the gap this repo has shipped four times.
  //
  // ABSENT AND EMPTY MEAN DIFFERENT THINGS, and conflating them cost real
  // safety. This read `fromServer && fromServer.length > 0`, so an empty list
  // fell back to offering everything — on the reasoning that a walled team must
  // never be left with no way to pay. That reasoning holds for ABSENT (an older
  // server, a payload we could not read). It is wrong for EMPTY, which is the
  // server positively telling us it cannot charge any of them, and where the
  // fallback turns a withheld card into a radio that ends in a 500.
  //
  // It matters most in exactly the window a reprice opens: new Plan objects have
  // to be minted at the new amounts, and between the deploy and the minting the
  // honest answer is "talk to us", not a button that errors. The full-weight
  // Talk to us card is already sitting beside this one.
  const offeredTiers = useMemo(() => {
    const fromServer = team?.purchasableTiers;
    return Array.isArray(fromServer) ? fromServer : WALL_TIERS;
  }, [team?.purchasableTiers]);

  /** Is there anything here a card can actually buy? Always true on the legacy
   *  branch, which reads its own PLAN_ORDER rather than the server's answer. */
  const canCheckOut = !PRICING_V2 || offeredTiers.length > 0;

  // The tier actually in play. DERIVED rather than corrected in an effect, and
  // that is worth a sentence: the offered list arrives asynchronously, so a
  // stored selection can briefly name a tier that is not on it. Correcting that
  // with a setState-in-effect leaves one rendered frame where the checked radio
  // is absent from its own list — and, worse, a frame in which Subscribe would
  // post a tier the customer never saw. Deriving it means that state cannot
  // exist, and it costs one fewer effect.
  //
  // EVERY read of the chosen tier goes through this, never `selectedTier`: the
  // picker, both checkout bodies and the analytics. `selectedTier` stays the raw
  // record of what the user clicked.
  const effectiveTier = offeredTiers.includes(selectedTier)
    ? selectedTier
    : (offeredTiers[0] ?? selectedTier);
  // Apple forbids linking out to external payment for a digital subscription
  // from inside a reviewed iOS app. Defaults false so the pre-hydration render
  // matches the server's, then flips post-mount (the LockedPageClient pattern).
  const [isIOSNativeApp, setIsIOSNativeApp] = useState(false);

  // The owner may reach this page from the trial indicator while they still
  // have access, to pay early. Without this the hasAccess bounce below would
  // throw them straight back out.
  // Two deliberate arrivals, and both must survive the bounce below.
  //
  // `activate` is an owner paying early from the trial strip. `upgrade` is a
  // team that has hit a plan ceiling — UrgansUsageStrip has linked here with it
  // since the caps shipped, and NOTHING read it, so a paying Manager team
  // clicking "See plans" was bounced straight back to the app by the
  // has-access effect. That made the link a no-op round trip rather than merely
  // a dead param.
  //
  // `reactivate` is a READ-ONLY team coming to fix a failed payment, and it is
  // load-bearing for the same reason: read-only is hasAccess TRUE (that is what
  // stops it drawing the wall), so without this the bounce below would eject the
  // one team that most needs this page. Every link that sends them here carries
  // it — see READ_ONLY_REACTIVATE_HREF.
  const intent = searchParams.get('intent');
  const isDeliberateVisit =
    intent === 'activate' || intent === 'upgrade' || intent === 'reactivate';
  const isUpgradeIntent = intent === 'upgrade';
  const isReadOnlyTeam = team?.state === 'read_only';

  const trackedRef = useRef(false);

  useEffect(() => {
    setIsIOSNativeApp(isIOSApp());
  }, []);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (isAuthLoading || !userId) return;
    let cancelled = false;
    void (async () => {
      const snapshot = await getTeamAccessClient(userId, { force: true });
      if (!cancelled) {
        setTeam(snapshot);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, userId]);

  // The numbers behind "your things are safe": rollouts, activities and teammates.
  // Telemetry-grade: a failure only means the generic line shows instead.
  useEffect(() => {
    if (!team || team.hasAccess) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch('/api/billing/wall-summary', {
          headers: { Authorization: `Bearer ${token}`, 'x-urganize-prefetch': '1' },
        });
        if (!response.ok) return;
        const counts = (await response.json()) as WallSummaryCounts;
        if (!cancelled) setSummaryLine(describeWallSummary(counts));
      } catch {
        // The generic line already says it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [team]);

  // Access came back while they were sitting here (the webhook landed, or an
  // admin comped them). Send them back into the app.
  useEffect(() => {
    if (!isDeliberateVisit && team?.hasAccess) {
      router.replace(HOME_PATH);
    }
  }, [isDeliberateVisit, team?.hasAccess, router]);

  // Tell the server a human is looking at the wall. It decides whether this is
  // the first hit or a return visit and whether the founder hears about it, so
  // the client cannot forge either. Once per mount, and never for an owner who
  // came here voluntarily to pay early.
  useEffect(() => {
    if (trackedRef.current) return;
    if (isLoading || !team || team.hasAccess) return;
    trackedRef.current = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        await fetch('/api/billing/track', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'paywall_view',
            planViewed: PRICING_V2 ? effectiveTier : selectedPlan,
          }),
        });
      } catch {
        // Telemetry must never affect what the user sees.
      }
    })();
  }, [isLoading, team, selectedPlan, effectiveTier]);

  const handleActivate = useCallback(async () => {
    setCheckoutError(null);
    setChangeResult(null);
    setIsStartingCheckout(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again and retry.');

      // A TEAM THAT ALREADY HAS ACCESS IS CHANGING PLAN, NOT ACTIVATING ONE,
      // and sending them to start-checkout would be actively harmful: that
      // route initializes with a Paystack plan code, so Paystack opens a SECOND
      // subscription on the same customer, and `subscription.create` matches on
      // paystack_customer_code — overwriting the code on our single row and
      // orphaning a subscription that keeps billing. It would also recompute
      // expires_at from scratch and throw away the period they already paid for.
      // canWrite, NOT hasAccess. A read-only team has access and no live period,
      // so quotePlanChange would refuse it with 'no_active_period' — a dead end
      // on the only button that page offers them. They are REACTIVATING, which
      // is an ordinary checkout. Reading canWrite here means this branch and the
      // quote agree by construction rather than by coincidence.
      if (PRICING_V2 && team?.hasAccess && team.canWrite) {
        const changeResponse = await fetch('/api/billing/change-plan', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: effectiveTier, interval: selectedInterval }),
        });
        const changePayload = (await changeResponse.json().catch(() => ({}))) as {
          kind?: string;
          authorizationUrl?: string;
          effectiveAt?: string;
          error?: string;
        };
        if (!changeResponse.ok) {
          throw new Error(changePayload.error || 'Could not change your plan.');
        }
        // An upgrade with something to pay goes to Paystack; a downgrade and a
        // free upgrade are already done, so say so rather than redirecting
        // somewhere that would look like a failed payment.
        if (changePayload.authorizationUrl) {
          if (isNativePlatform()) {
            await openExternalUrl(changePayload.authorizationUrl);
            setIsStartingCheckout(false);
          } else if (typeof window !== 'undefined') {
            window.location.href = changePayload.authorizationUrl;
          }
          return;
        }
        setChangeResult(
          changePayload.kind === 'downgrade'
            ? 'Done. Your new plan starts when this period ends, and nothing changes before then.'
            : 'Done. Your new plan is active now.'
        );
        setIsStartingCheckout(false);
        if (userId) void getTeamAccessClient(userId, { force: true }).then(setTeam);
        return;
      }

      const response = await fetch('/api/billing/start-checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        // Under v2 the tier and the interval are two fields, and the interval
        // is REQUIRED: resolveCheckoutPurchase rejects a tier without one,
        // because nothing else could tell the webhook how far to set
        // expires_at. Flag off, this body is byte-identical to before.
        body: JSON.stringify({
          plan: PRICING_V2 ? effectiveTier : selectedPlan,
          currency: 'NGN',
          ...(PRICING_V2 ? { interval: selectedInterval } : {}),
          ...(team?.primaryWorkspaceId ? { workspaceId: team.primaryWorkspaceId } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.authorizationUrl) {
        throw new Error(payload.error || 'Could not start checkout.');
      }

      // Android: a Paystack page should not take over the app's own webview.
      if (isNativePlatform()) {
        await openExternalUrl(payload.authorizationUrl);
        setIsStartingCheckout(false);
      } else if (typeof window !== 'undefined') {
        window.location.href = payload.authorizationUrl;
      }
    } catch (error) {
      setCheckoutError(errorMessage(error, 'Could not start checkout.'));
      setIsStartingCheckout(false);
    }
  }, [
    selectedPlan,
    effectiveTier,
    team?.hasAccess,
    team?.canWrite,
    team?.primaryWorkspaceId,
    userId,
  ]);

  const trackTalkToUs = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch('/api/billing/track', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'talk_to_us',
          planViewed: PRICING_V2 ? effectiveTier : selectedPlan,
        }),
      });
    } catch {
      // Never block the conversation on telemetry.
    }
  }, [selectedPlan, effectiveTier]);

  const handleWhatsApp = useCallback(() => {
    void trackTalkToUs();
    void openExternalUrl(SALES_WHATSAPP_URL);
  }, [trackTalkToUs]);

  const handleEmail = useCallback(() => {
    void trackTalkToUs();
    if (typeof window !== 'undefined') {
      window.location.href = `mailto:${SALES_CONTACT_EMAIL}?subject=${encodeURIComponent(
        'Urganize plan for my team'
      )}`;
    }
  }, [trackTalkToUs]);

  const handleNotifyAdmin = useCallback(async () => {
    setNotifyError(null);
    setNotifyState('sending');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again and retry.');
      const response = await fetch('/api/billing/notify-admin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not send that.');
      setNotifyState('sent');
    } catch (error) {
      setNotifyError(errorMessage(error, 'Could not send that.'));
      setNotifyState('error');
    }
  }, []);

  const ownerLabel = useMemo(() => team?.ownerName?.trim() || null, [team?.ownerName]);

  if (isAuthLoading || isLoading) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
          <Logo />
          <div className="h-8 w-64 animate-pulse rounded bg-bg-elevated" />
          <div className="h-48 w-full animate-pulse rounded-lg bg-bg-elevated" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="mx-auto flex w-full max-w-md flex-col gap-6">
          <Logo />
          <h1 className="font-display text-2xl font-semibold text-content-primary">
            Sign in to continue.
          </h1>
          <Button variant="primary" onClick={() => router.push('/auth?next=/locked')}>
            Sign in
          </Button>
        </div>
      </main>
    );
  }

  const isOwner = Boolean(team?.isOwnerOrAdmin);

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
        <Logo />

        <header className="flex flex-col gap-3">
          <h1 className="font-display text-3xl font-semibold text-content-primary">
            {isUpgradeIntent
              ? 'Move up a plan.'
              : isReadOnlyTeam
                ? 'Your plan ended.'
                : team?.state === 'walled'
                  ? 'Your trial has ended.'
                  : 'Activate your plan.'}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-content-secondary">
            {isUpgradeIntent ? (
              // Someone who arrived here from a ceiling already has access, so
              // the reassurance below would be answering a question they did
              // not ask.
              'Pick the plan that fits what your team is doing now. Your rollouts carry over untouched.'
            ) : isReadOnlyTeam ? (
              // They can already see everything, so the reassurance is about
              // what they cannot do rather than what they might have lost.
              'Your team can still see everything. Pay again to start making changes.'
            ) : (
              <>
                {summaryLine ?? 'Your rollouts, tasks and files are safe and waiting.'}
                {team?.teamName ? ` Nothing on ${team.teamName} has been removed.` : ''}
              </>
            )}
          </p>
        </header>

        {isOwner ? (
          <div className="flex flex-col gap-4">
            {/* Activate. Annual first and highlighted: it is the better deal
                and the one most teams should take. */}
            <Card padding="lg" className="flex flex-col gap-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-content-primary">
                  Pick your plan
                </h2>
                <p className="mt-1 text-sm text-content-secondary">
                  One price covers your whole team.
                </p>
              </div>

              {isIOSNativeApp ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-stroke-default bg-bg-elevated p-4 text-sm text-content-secondary">
                    <p>
                      Plans are activated on the web. Open{' '}
                      <button
                        type="button"
                        onClick={() => openExternalUrl('https://app.urganize.app/locked')}
                        className="underline text-content-primary hover:text-brand"
                      >
                        app.urganize.app
                      </button>{' '}
                      in your browser to finish, then come back here.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      if (userId) void getTeamAccessClient(userId, { force: true }).then(setTeam);
                    }}
                  >
                    Check again
                  </Button>
                </div>
              ) : (
                <>
                  {PRICING_V2 && !canCheckOut ? (
                    // Nothing is mintable in this environment. Say so plainly
                    // rather than rendering an empty fieldset above a button
                    // that would 500 — and point at the card beside this one,
                    // because a refusal with no next step is a dead end.
                    <p className="rounded-lg border border-stroke-default bg-bg-elevated p-4 text-sm text-content-secondary">
                      Card payment is not available right now. Talk to us and we
                      will get your team on a plan today.
                    </p>
                  ) : PRICING_V2 ? (
                    <TierPlanPicker
                      tiers={offeredTiers}
                      selectedTier={effectiveTier}
                      onSelectTier={setSelectedTier}
                      selectedInterval={selectedInterval}
                      onSelectInterval={setSelectedInterval}
                      disabled={isStartingCheckout}
                    />
                  ) : (
                  /* THE LEGACY PICKER, and the one place a monthly figure
                     survives the 2026-09-08 annual-only reprice. Deliberate:
                     this branch only renders with NEXT_PUBLIC_FEATURE_PRICING_V2
                     OFF, which is the documented rollback state, and its numbers
                     come from BILLING_PLANS — what real legacy subscribers still
                     renew against. Sweeping it would mean editing their prices
                     to tidy a screen nobody in production sees. */
                  <div role="radiogroup" aria-label="Choose a plan" className="flex flex-col gap-2">
                    {PLAN_ORDER.map((planId) => {
                      const plan = getPlan(planId);
                      const isActive = selectedPlan === planId;
                      return (
                        <button
                          key={planId}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          onClick={() => setSelectedPlan(planId)}
                          className={`flex items-start justify-between gap-3 rounded-lg border p-4 text-left transition-colors ${
                            isActive
                              ? 'border-brand bg-brand/5'
                              : 'border-stroke-default bg-bg-elevated hover:border-stroke-strong'
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-content-primary">
                              {plan.label}
                              {planId === 'annual' ? (
                                <span className="ml-2 rounded-full bg-brand/12 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
                                  2 months free
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-xs text-content-tertiary">
                              {plan.description}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-content-primary">
                            {formatPlanCyclePrice(planId, 'NGN')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  )}

                  <ul className="flex flex-col gap-2">
                    {VALUE_LINES.map((line) => (
                      <li
                        key={line}
                        className="flex items-start gap-2 text-sm text-content-secondary"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>

                  {/* HIDDEN rather than disabled when there is nothing to buy.
                      A greyed-out button with no explanation is the pattern this
                      repo already corrected on the seat cap: there the round
                      trip carried the reason, and here the server has already
                      given it, so the line above says it and the button goes. */}
                  {canCheckOut ? (
                    <Button
                      variant="primary"
                      className="min-h-14 w-full text-base"
                      disabled={isStartingCheckout}
                      onClick={handleActivate}
                    >
                      {isStartingCheckout
                        ? 'Opening secure checkout'
                        : isUpgradeIntent
                          ? 'Change your plan'
                          : isReadOnlyTeam
                            ? 'Start your plan again'
                            : 'Activate your plan'}
                    </Button>
                  ) : null}

                  {canCheckOut ? (
                    <p className="-mt-2 text-center text-xs text-content-tertiary">
                      Secure checkout with Paystack, paid in naira.
                    </p>
                  ) : null}

                  {checkoutError ? (
                    <p role="alert" className="flex items-start gap-2 text-sm text-status-error">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>{checkoutError}</span>
                    </p>
                  ) : null}

                  {changeResult ? (
                    <p className="flex items-start gap-2 text-sm text-content-secondary">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" />
                      <span>{changeResult}</span>
                    </p>
                  ) : null}
                </>
              )}
            </Card>

            {/* Talk to us: a quiet second path, not a rival button. One filled action
                converts best; teams that close over an invoice still find this in one
                tap, right under the thing they are deciding about. */}
            <p className="text-center text-sm text-content-secondary">
              {PRICING_V2
                ? 'Running a bigger roster, or prefer an invoice?'
                : 'Prefer an invoice or a walkthrough?'}{' '}
              <button
                type="button"
                onClick={handleWhatsApp}
                className="motion-focus inline-flex min-h-11 items-center gap-1 font-semibold text-content-primary underline underline-offset-4 hover:text-brand"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                Message us on WhatsApp
              </button>{' '}
              or{' '}
              <button
                type="button"
                onClick={handleEmail}
                className="motion-focus inline-flex min-h-11 items-center font-semibold text-content-primary underline underline-offset-4 hover:text-brand"
              >
                email us
              </button>
              .
            </p>
          </div>
        ) : (
          <Card padding="lg" className="flex max-w-2xl flex-col gap-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-content-primary">
                Your team admin needs to activate the plan.
              </h2>
              <p className="mt-2 text-sm leading-6 text-content-secondary">
                {ownerLabel
                  ? `${ownerLabel} runs billing for this team. Once the plan is active, everything you were working on is right here.`
                  : 'The person who runs billing for this team can activate it. Once the plan is active, everything you were working on is right here.'}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="primary"
                disabled={notifyState === 'sending' || notifyState === 'sent'}
                onClick={handleNotifyAdmin}
              >
                {notifyState === 'sending'
                  ? 'Sending'
                  : notifyState === 'sent'
                    ? 'Your admin has been notified'
                    : 'Notify my admin'}
              </Button>
              {notifyState === 'sent' ? (
                <span className="text-sm text-content-tertiary">
                  We let them know you are waiting.
                </span>
              ) : null}
            </div>

            {notifyError ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-status-error">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{notifyError}</span>
              </p>
            ) : null}
          </Card>
        )}

        {/* UrgAns stays usable on credits, changes included, while the rest of the
            app is behind the wall. Renders nothing with credits off or no balance. */}
        <WallUrgansCard />

        <p className="text-center text-xs text-content-tertiary">
          {user?.email ? (
            <>
              Signed in as <span className="text-content-secondary">{user.email}</span>. Not you?{' '}
              {/* This page has no app chrome, so without this a person on the
                  wrong account had no way off it. */}
              <button
                type="button"
                onClick={() => {
                  void logout().then(() => router.push('/auth'));
                }}
                className="underline text-content-secondary hover:text-content-primary"
              >
                Sign out
              </button>
              .{' '}
            </>
          ) : null}
          Need a hand?{' '}
          <a className="underline text-content-secondary" href={`mailto:${SALES_CONTACT_EMAIL}`}>
            {SALES_CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </main>
  );
}
