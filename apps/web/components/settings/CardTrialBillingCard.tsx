'use client';

// The card trial in Settings (2026-11-14, #1266; mock
// docs/mocks/card-trial-abroad, screens 4 and 5). For a customer abroad whose
// card Bachs holds: when the free days end, what the card is charged after,
// and the two things they can do about it, cancel and change the card.
//
// Renders nothing for everyone else (no card trial, or one that has ended), so
// the billing section reads exactly as before for them. The card itself is
// never shown: Bachs holds it, and "Change card" opens Bachs's own page.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PRICING_TIERS, isPricingTierId } from '@urganize/pricing';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { formatChargeDay, isLiveBachsStatus, pricePerPeriod, type CardTrialPeriod } from '@/lib/bachs-trial';
import { feedbackErrorClass } from './feedback';
import { getAccessToken } from './getAccessToken';

type CardTrial = {
  status: string;
  plan: string;
  period: CardTrialPeriod;
  amountUsd: number;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-stroke-control px-4 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-50';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-content-secondary">{label}</span>
      <span className="text-right font-semibold text-content-primary">{value}</span>
    </div>
  );
}

export function CardTrialBillingCard() {
  const [trial, setTrial] = useState<CardTrial | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'cancel' | 'card' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch('/api/billing/bachs/trial', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) return;
      const payload = (await response.json().catch(() => ({}))) as { trial?: CardTrial | null };
      setTrial(payload.trial ?? null);
    } catch {
      // No card: the rest of the billing section already says what is true.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!confirming) return;
    return lockBodyScroll();
  }, [confirming]);

  if (!trial || !isLiveBachsStatus(trial.status)) return null;

  const trialing = trial.status === 'trialing';
  const endDay = formatChargeDay(trialing ? trial.trialEnd : trial.currentPeriodEnd);
  const planName = isPricingTierId(trial.plan) ? PRICING_TIERS[trial.plan].label : 'Your plan';
  const price = pricePerPeriod(trial.amountUsd, trial.period);

  const cancel = async () => {
    setBusy('cancel');
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/billing/bachs/cancel', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error || 'Could not cancel. Try again.');
        return;
      }
      setConfirming(false);
      await load();
    } catch {
      setError('Could not cancel. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const changeCard = async () => {
    setBusy('card');
    setError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/billing/bachs/portal', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        setError(payload.error || 'Could not open the card page. Try again.');
        return;
      }
      window.location.href = payload.url;
    } catch {
      setError('Could not open the card page. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-stroke-default p-4">
      <p className="inline-flex rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
        {trialing ? 'Free trial' : trial.status === 'past_due' ? 'Card needs attention' : 'Card on file'}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Row label="Plan" value={planName} />
        {trial.cancelAtPeriodEnd ? (
          <p className="text-sm text-content-secondary">
            {trialing ? 'Trial ends' : 'Your plan ends'} {endDay}. You will not be charged{trialing ? '' : ' again'}.
          </p>
        ) : trial.status === 'past_due' ? (
          <p className="text-sm text-content-secondary">Your card did not go through. Change it to keep your plan.</p>
        ) : (
          <>
            <Row label={trialing ? 'Trial ends' : 'Next charge'} value={endDay} />
            <Row label={trialing ? 'Then' : 'Price'} value={price} />
          </>
        )}
      </div>
      {error ? (
        <div role="alert" className={`${feedbackErrorClass} mt-3`}>
          {error}
        </div>
      ) : null}
      {trial.cancelAtPeriodEnd ? null : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={changeCard} disabled={busy !== null} className={buttonClass}>
            Change card
          </button>
          <button type="button" onClick={() => setConfirming(true)} disabled={busy !== null} className={buttonClass}>
            {trialing ? 'Cancel trial' : 'Cancel plan'}
          </button>
        </div>
      )}

      {confirming && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[180] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
              onClick={(event) => {
                if (event.target === event.currentTarget && busy === null) setConfirming(false);
              }}
            >
              <DialogPanel
                label={trialing ? 'Cancel your trial?' : 'Cancel your plan?'}
                onClose={() => {
                  if (busy === null) setConfirming(false);
                }}
                className="w-full max-w-md rounded-t-2xl bg-bg-base p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] text-content-primary outline-none sm:rounded-2xl"
              >
                <h2 className="font-display text-2xl font-normal">{trialing ? 'Cancel your trial?' : 'Cancel your plan?'}</h2>
                <p className="mt-2 text-[15px] text-content-secondary">
                  {trialing
                    ? `We will not charge your card. You keep everything until ${endDay}. After that you pick a plan to carry on.`
                    : `We will not charge your card again. You keep everything until ${endDay}, then your rollouts are kept but read only.`}
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={busy !== null}
                    aria-busy={busy === 'cancel'}
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-status-error px-5 text-[15px] font-semibold text-white disabled:opacity-50"
                  >
                    {trialing ? 'Cancel trial' : 'Cancel plan'}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy !== null} className={`${buttonClass} min-h-12`}>
                    {trialing ? 'Keep my trial' : 'Keep my plan'}
                  </button>
                </div>
              </DialogPanel>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
