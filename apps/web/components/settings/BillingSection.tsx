'use client';

import { useCallback, useEffect, useState } from 'react';
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
} as const;

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
        <div className={feedbackErrorClass}>{error}</div>
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

  const { title, details, cta, secondaryCta } = summarizeBilling(snapshot, {
    cardTrialEnabled: isCardTrialEnabled(),
    ...(team ? { team } : {}),
  });
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
          <button type="button" onClick={() => router.push('/locked')} className={ctaClass}>
            {CTA_LABEL[cta]}
          </button>
        ) : null}
      </div>

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
          {cancelError ? <div className={`${feedbackErrorClass} mt-2`}>{cancelError}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
