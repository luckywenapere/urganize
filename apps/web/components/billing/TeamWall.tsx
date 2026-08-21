'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Logo } from '@urganize/ui';
import {
  SALES_CONTACT_EMAIL,
  SALES_WHATSAPP_URL,
  formatPlanCyclePrice,
  getPlan,
} from '@urganize/pricing';
import { AlertTriangle, CheckCircle2, MessageCircle } from 'lucide-react';
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

const VALUE_LINES = [
  'Every release, task and file exactly where you left it.',
  'Your whole team, on the same plan.',
  'Cancel whenever you want, from settings.',
];

export function TeamWall() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [team, setTeam] = useState<TeamAccessClientSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [notifyState, setNotifyState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [notifyError, setNotifyError] = useState<string | null>(null);
  // Apple forbids linking out to external payment for a digital subscription
  // from inside a reviewed iOS app. Defaults false so the pre-hydration render
  // matches the server's, then flips post-mount (the LockedPageClient pattern).
  const [isIOSNativeApp, setIsIOSNativeApp] = useState(false);

  // The owner may reach this page from the trial indicator while they still
  // have access, to pay early. Without this the hasAccess bounce below would
  // throw them straight back out.
  const isActivateIntent = searchParams.get('intent') === 'activate';

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

  // Access came back while they were sitting here (the webhook landed, or an
  // admin comped them). Send them back into the app.
  useEffect(() => {
    if (!isActivateIntent && team?.hasAccess) {
      router.replace(HOME_PATH);
    }
  }, [isActivateIntent, team?.hasAccess, router]);

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
          body: JSON.stringify({ event: 'paywall_view', planViewed: selectedPlan }),
        });
      } catch {
        // Telemetry must never affect what the user sees.
      }
    })();
  }, [isLoading, team, selectedPlan]);

  const handleActivate = useCallback(async () => {
    setCheckoutError(null);
    setIsStartingCheckout(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again and retry.');

      const response = await fetch('/api/billing/start-checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selectedPlan,
          currency: 'NGN',
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
  }, [selectedPlan, team?.primaryWorkspaceId]);

  const trackTalkToUs = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch('/api/billing/track', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'talk_to_us', planViewed: selectedPlan }),
      });
    } catch {
      // Never block the conversation on telemetry.
    }
  }, [selectedPlan]);

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
      <main className="min-h-screen bg-bg-base px-4 py-12">
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
      <main className="min-h-screen bg-bg-base px-4 py-12">
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
    <main className="min-h-screen bg-bg-base px-4 py-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <Logo />

        <header className="flex flex-col gap-3">
          <h1 className="font-display text-3xl font-semibold text-content-primary">
            {team?.state === 'walled' ? 'Your trial has ended.' : 'Activate your plan.'}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-content-secondary">
            Your releases, tasks and files are safe and waiting.
            {team?.teamName ? ` Nothing on ${team.teamName} has been removed.` : ''}
          </p>
        </header>

        {isOwner ? (
          <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
            {/* Activate. Annual first and highlighted: it is the better deal
                and the one most teams should take. */}
            <Card padding="lg" className="flex flex-col gap-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-content-primary">
                  Activate your plan
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

                  <Button
                    variant="primary"
                    className="w-full"
                    disabled={isStartingCheckout}
                    onClick={handleActivate}
                  >
                    {isStartingCheckout ? 'Opening secure checkout' : 'Activate your plan'}
                  </Button>

                  {checkoutError ? (
                    <p className="flex items-start gap-2 text-sm text-status-error">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>{checkoutError}</span>
                    </p>
                  ) : null}
                </>
              )}
            </Card>

            {/* Talk to us. Same weight as checkout, deliberately. */}
            <Card padding="lg" className="flex flex-col gap-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-content-primary">
                  Talk to us
                </h2>
                <p className="mt-1 text-sm text-content-secondary">
                  Prefer an invoice or a walkthrough for your team? Talk to us directly.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="secondary" className="w-full" onClick={handleWhatsApp}>
                  <span className="inline-flex items-center gap-2">
                    <MessageCircle className="size-4" aria-hidden="true" />
                    Message us on WhatsApp
                  </span>
                </Button>
                <Button variant="secondary" className="w-full" onClick={handleEmail}>
                  Email {SALES_CONTACT_EMAIL}
                </Button>
              </div>

              <p className="text-xs leading-6 text-content-tertiary">
                We set up annual agreements, invoices and bank transfers for labels and
                management teams every week. Tell us how your team pays and we will match it.
              </p>
            </Card>
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
              <p className="flex items-start gap-2 text-sm text-status-error">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{notifyError}</span>
              </p>
            ) : null}
          </Card>
        )}

        <p className="text-center text-xs text-content-tertiary">
          {user?.email ? (
            <>
              Signed in as <span className="text-content-secondary">{user.email}</span>.{' '}
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
