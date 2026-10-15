'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SALES_CONTACT_EMAIL } from '@urganize/pricing';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import {
  formatBillingDate,
  summarizeBilling,
  type BillingAccountStatus,
  type BillingSnapshot,
} from '@/lib/billing-summary';
import { errorMessage } from '@/lib/errors';
import { isCardTrialEnabled } from '@/lib/trial-card';
import { isCreditsEnabled } from '@/lib/credits/config';
import { isCancelFlowEnabled } from '@/lib/cancel-flow';
import { READ_ONLY_REACTIVATE_HREF } from '@/lib/team-billing';
import { feedbackErrorClass } from './feedback';
import { getAccessToken } from './getAccessToken';
import { panelClass } from './panelClass';

// What this account is paying, and when that runs out (2026-08-13).
//
// Built because `app/payment/callback/page.tsx` has a button literally labelled
// "Billing" that pushes `/settings` — and Settings had no billing anything, on
// any tab, before or after the four-tab restructure. Someone who had just paid
// landed on a page that never confirmed what they bought.
//
// It lives at the TOP of the Account tab, which is the default tab, so that
// callback button now lands on this section with no further navigation. Account
// rather than a fifth "Billing" pill because the subscription is per-USER in the
// schema (`subscriptions.user_id`, `profiles.is_subscribed`), and because a
// fifth pill needs ~66px where only ~42px is spare at 375px — it would put the
// tab row back to scrolling on a phone.
//
// Deliberately a STATUS surface with one exit, not a second checkout: `/locked`
// owns the plan picker, the currency toggle, the trial button and the promo
// field. Duplicating any of that here would give us two places to keep in step
// on price and eligibility.
//
// That single exit is also why there is NO iOS branch in this file, unlike
// LockedPageClient. Apple's rule is about linking OUT to external payment; "See
// plans" is an in-app route to `/locked`, which already hides pricing and the
// Subscribe button on iOS native and offers the manage-on-the-web pointer
// instead. One file owns that policy; a second copy here would be a second
// thing to remember when the policy changes.
//
// All copy decisions live in lib/billing-summary.ts, which is unit-tested —
// this file fetches, renders, and nothing else.

const CTA_LABEL = {
  plans: 'See plans',
  change: 'Change plan',
  contact: 'Contact us',
  reactivate: 'Update payment',
} as const;

/** Where each CTA lands. The intent params are not decoration: /locked bounces
 *  anyone who HAS access back into the app, so 'change' (a paying team),
 *  'reactivate' (a read-only team) and 'plans' would all be no-op round trips
 *  without one. 'plans' carries intent=activate because a TRIALING team has
 *  access too: a bare /locked sent trial owners clicking "See plans" straight
 *  back Home (found 2026-10-15). A walled team ignores the param, so it is safe
 *  for them as well. Same intent the trial strip already uses. */
const CTA_HREF: Record<'plans' | 'change' | 'reactivate', string> = {
  plans: '/locked?intent=activate',
  change: '/locked?intent=upgrade',
  reactivate: '/locked?intent=reactivate',
};

export function BillingSection() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  // Cancel-trial (card-backed trials only): a two-step inline confirm — the
  // first click reveals the consequence line + Confirm/Keep, never a modal.
  const [team, setTeam] = useState<{
    state: string;
    trialDaysLeft: number;
    trialEndsAt: string | null;
    isOwnerOrAdmin: boolean;
    teamName: string | null;
  } | null>(null);
  // The cancel flow (2026-10-14): what the owner can do from here. Null means
  // "no flow" (not the owner, nothing to cancel, the flag off, or the
  // migration not applied yet), and the old card-trial control stays.
  const [cancelFlow, setCancelFlow] = useState<{
    kind: 'trial' | 'paid';
    state: 'active' | 'cancelled' | 'paused';
    pauseUntil: string | null;
    canResumeInPlace: boolean;
  } | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      const token = await getAccessToken();
      // No token means the session went away underneath us (sign-out, expiry).
      // The page's own auth gate handles that; a billing error stacked on top of
      // a redirect would just be noise.
      if (!token) {
        setSnapshot(null);
        return;
      }

      const response = await fetch('/api/subscription-status', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        // Never cached: someone arriving from the payment callback must see the
        // state the webhook just wrote, not a copy from before they paid. Same
        // reason this section holds no cross-mount cache — freshness beats
        // saving a request on the page people open to check exactly this.
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : 'Could not load your billing details.'
        );
      }

      setSnapshot({
        accountStatus: (payload.accountStatus as BillingAccountStatus) || 'unpaid',
        plan: typeof payload.plan === 'string' ? payload.plan : null,
        rawStatus: typeof payload.rawStatus === 'string' ? payload.rawStatus : null,
        trialEndsAt: typeof payload.trialEndsAt === 'string' ? payload.trialEndsAt : null,
        trialDaysLeft: typeof payload.trialDaysLeft === 'number' ? payload.trialDaysLeft : 0,
        expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : null,
        trialUsed: Boolean(payload.trialUsed),
        allowlisted: Boolean(payload.allowlisted),
      });
      // Team access rides the same payload (hard-paywall flow). Absent means
      // the flag is off server-side, and every string here stays as it was.
      const team = payload.teamAccess as Record<string, unknown> | null | undefined;
      setTeam(
        team && typeof team.state === 'string'
          ? {
              state: team.state,
              trialDaysLeft: typeof team.trialDaysLeft === 'number' ? team.trialDaysLeft : 0,
              trialEndsAt: typeof team.trialEndsAt === 'string' ? team.trialEndsAt : null,
              isOwnerOrAdmin: Boolean(team.isOwnerOrAdmin),
              teamName: typeof team.teamName === 'string' ? team.teamName : null,
            }
          : null
      );
      setIsConfirmingCancel(false);
      setCancelError('');

      if (isCancelFlowEnabled()) {
        const flowResponse = await fetch('/api/billing/cancel-flow', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }).catch(() => null);
        const flow = flowResponse
          ? ((await flowResponse.json().catch(() => ({}))) as Record<string, unknown>)
          : {};
        const pause = flow.pause as { until?: unknown } | null | undefined;
        setCancelFlow(
          flow.available === true && (flow.kind === 'trial' || flow.kind === 'paid')
            ? {
                kind: flow.kind,
                state: flow.state === 'paused' || flow.state === 'cancelled' ? flow.state : 'active',
                pauseUntil: pause && typeof pause.until === 'string' ? pause.until : null,
                canResumeInPlace: flow.canResumeInPlace === true,
              }
            : null
        );
      }
    } catch (caught) {
      setError(errorMessage(caught, 'Could not load your billing details.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancelTrial = useCallback(async () => {
    setCancelError('');
    setIsCancelling(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Sign in again and retry.');
      const response = await fetch('/api/billing/cancel-trial', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not cancel the upcoming charge.');
      }
      // Re-load so the section flips to "Cancelled — access until <date>".
      await load();
    } catch (caught) {
      setCancelError(errorMessage(caught, 'Could not cancel the upcoming charge.'));
    } finally {
      setIsCancelling(false);
    }
  }, [load]);

  // One tap back: re-enables the plan while the period still runs, otherwise
  // goes to the checkout (the app never charges on its own).
  const handleResume = useCallback(async () => {
    setCancelError('');
    setIsResuming(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Sign in again and retry.');
      const response = await fetch('/api/billing/cancel-flow', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; resumed?: boolean; href?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not resume right now.');
      if (payload.resumed) {
        await load();
      } else {
        router.push(payload.href || READ_ONLY_REACTIVATE_HREF);
      }
    } catch (caught) {
      setCancelError(errorMessage(caught, 'Could not resume right now.'));
    } finally {
      setIsResuming(false);
    }
  }, [load, router]);

  const heading = (
    <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
      Billing
    </h2>
  );

  if (isLoading) {
    return (
      <section className={panelClass}>
        {heading}
        <SkeletonBlock className="h-16 w-full rounded-lg" />
      </section>
    );
  }

  if (error) {
    return (
      <section className={panelClass}>
        {heading}
        <div role="alert" className={feedbackErrorClass}>{error}</div>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:bg-bg-hover"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!snapshot) return null;

  const { title, details, cta, secondaryCta: summaryCta } = summarizeBilling(snapshot, {
    cardTrialEnabled: isCardTrialEnabled(),
    ...(team ? { team } : {}),
    pausedUntil: cancelFlow?.state === 'paused' ? cancelFlow.pauseUntil : null,
  });
  // The cancel flow replaces the inline card-trial cancel whenever it is there.
  const secondaryCta = cancelFlow ? null : summaryCta;
  const ctaClass =
    'shrink-0 rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:bg-bg-hover';
  const accessUntil = formatBillingDate(snapshot.trialEndsAt) || formatBillingDate(snapshot.expiresAt);

  return (
    <section className={panelClass}>
      {heading}
      {/* Flat, no card box. Two reasons, and they point the same way: panelClass
          records the founder call that boxed sections read as "plastic" and the
          page is now flat regions divided by hairlines — and a box here actively
          broke the button, because `bg-bg-surface` on `bg-bg-elevated` is the
          same colour in light mode (CLAUDE.md flags that pair), leaving the CTA
          defined by nothing but a 6%-opacity border. On the section ground the
          button sits in the same context as the tab pills, which use these exact
          classes and are legible in both themes. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-content-primary">{title}</p>
          {details.map((line) => (
            <p key={line} className="mt-1 text-sm text-content-secondary">
              {line}
            </p>
          ))}
        </div>

        {cta === 'contact' ? (
          // A Label deal is scoped and quoted per roster by the founders and has
          // no wired self-serve checkout, so /locked's picker would be a dead
          // end for it.
          <a href={`mailto:${SALES_CONTACT_EMAIL}`} className={ctaClass}>
            {CTA_LABEL.contact}
          </a>
        ) : cta ? (
          // 'change' MUST carry the intent param, and this was a live dead end
          // until 2026-08-24: a paying team clicking "Change plan" landed on
          // /locked, whose has-access effect immediately replaced them back into
          // the app. A no-op round trip, and exactly the same bug that
          // UrgansUsageStrip's "See plans" had before it was given
          // ?intent=upgrade. 'reactivate' carries one for the same reason — a
          // read-only team has access too. See CTA_HREF.
          <button
            type="button"
            onClick={() => router.push(CTA_HREF[cta])}
            className={ctaClass}
          >
            {CTA_LABEL[cta]}
          </button>
        ) : null}
      </div>

      {isCreditsEnabled() ? (
        <p className="mt-4 text-sm">
          <Link
            href="/dashboard/credits"
            className="motion-focus text-content-secondary underline underline-offset-2 hover:text-content-primary"
          >
            See your UrgAns credit history
          </Link>
        </p>
      ) : null}

      {cancelFlow && cancelFlow.state === 'active' ? (
        // The cancel flow (2026-10-14): offers, a pause, two questions, then
        // the cancel. Quiet link, the old control's weight.
        <div className="mt-4">
          <button
            type="button"
            onClick={() => router.push('/dashboard/cancel')}
            className="text-sm text-content-tertiary underline hover:text-content-secondary"
          >
            {cancelFlow.kind === 'trial' ? 'Cancel trial' : 'Cancel plan'}
          </button>
        </div>
      ) : null}

      {cancelFlow && (cancelFlow.state === 'paused' || (cancelFlow.state === 'cancelled' && cancelFlow.canResumeInPlace)) ? (
        <div className="mt-4">
          <button type="button" disabled={isResuming} onClick={() => void handleResume()} className={ctaClass}>
            {isResuming ? 'Resuming…' : cancelFlow.state === 'paused' ? 'Resume now' : 'Resume my plan'}
          </button>
          {cancelError ? <div role="alert" className={`${feedbackErrorClass} mt-2`}>{cancelError}</div> : null}
        </div>
      ) : null}

      {secondaryCta === 'cancelTrial' ? (
        // Card-backed trial only: stop the charge Paystack has scheduled for
        // trial end. Two-step inline confirm (never a modal) — the first click
        // reveals the consequence line, and Keep backs out.
        <div className="mt-4">
          {isConfirmingCancel ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-content-secondary">
                {accessUntil
                  ? `Your access continues until ${accessUntil}, then your card won't be charged.`
                  : "Your access continues to the end of the trial, then your card won't be charged."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => void handleCancelTrial()}
                  className="rounded-lg border border-status-error/40 bg-bg-surface px-4 py-2 text-sm font-medium text-status-error hover:bg-status-error/10 disabled:opacity-60"
                >
                  {isCancelling ? 'Cancelling…' : 'Confirm cancel'}
                </button>
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => {
                    setIsConfirmingCancel(false);
                    setCancelError('');
                  }}
                  className={ctaClass}
                >
                  Keep my trial
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsConfirmingCancel(true)}
              className="text-sm text-content-tertiary underline hover:text-content-secondary"
            >
              Cancel trial
            </button>
          )}
          {cancelError ? <div role="alert" className={`${feedbackErrorClass} mt-2`}>{cancelError}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
