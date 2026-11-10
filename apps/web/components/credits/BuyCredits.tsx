'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from '@/components/icons';
import { authHeaders, readError } from '@/components/press-kits/press-kit-client';
import type { CreditAccount } from '@/lib/credits/allowance';
import { isCreditsPurchasable } from '@/lib/credits/config';
import { TOPUP_PACKS, creditsForPack, packPriceUsd } from '@/lib/credits/packs';
import { useVisitorCurrency } from '@/lib/visitor-currency';
import { isCreditsReference, type CreditsReturnPath } from '@/lib/credits/purchase';
import { openPaystackCheckout } from '@/lib/pitch-payments-client';
import { isIOSApp } from '@/lib/platform';

/**
 * The four credit packs, and what happens when you come back from paying.
 *
 * Not shown inside the iOS app: Apple does not allow a reviewed iOS app to send
 * people to an outside payment page for something used in the app (the line the
 * billing wall and paid pitching already draw). The web and the Android app take
 * payments.
 *
 * The number on each button is worked out from the account the same way the
 * server does it when checkout starts (creditsForPack), and the server decides
 * again at that moment, so what a button promises is what is credited.
 */

type Props = {
  account: CreditAccount | null;
  /** Called once a purchase has landed, so the balance and the history can reload. */
  onPurchased: () => void;
  /** Where Paystack sends the buyer back: the credits page, or the UrgAns page behind the wall. */
  returnTo?: CreditsReturnPath;
};

type Notice =
  | { kind: 'pending' }
  | { kind: 'paid'; credits: number }
  | { kind: 'not_paid' }
  | { kind: 'needs_review' }
  | { kind: 'error' };

const naira = (value: number): string => `₦${value.toLocaleString('en')}`;
/** Outside Nigeria a pack is paid in US dollars (#1120). */
const dollars = (value: number): string => `$${value.toLocaleString('en')}`;

const VERIFY_ATTEMPTS = 6;
const VERIFY_GAP_MS = 2000;

export function BuyCredits({ account, onPurchased, returnTo = '/dashboard/credits' }: Props) {
  const [busyPrice, setBusyPrice] = useState<number | null>(null);
  const currency = useVisitorCurrency();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const ranReturn = useRef(false);

  // Coming back from Paystack: the callback carries ?reference= (and ?trxref=).
  // Read once from the address bar rather than through useSearchParams, which in a
  // statically prerendered page would bail the whole route out to its loading UI.
  useEffect(() => {
    if (ranReturn.current || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const reference = (params.get('reference') || params.get('trxref') || '').trim();
    if (!isCreditsReference(reference)) return;
    ranReturn.current = true;
    setNotice({ kind: 'pending' });

    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < VERIFY_ATTEMPTS && !cancelled; attempt += 1) {
        const headers = await authHeaders();
        if (!headers) return;
        try {
          const response = await fetch(`/api/credits/checkout/verify?reference=${encodeURIComponent(reference)}`, {
            headers,
            cache: 'no-store',
          });
          const body = (await response.json().catch(() => ({}))) as { state?: string; credits?: number };
          if (body.state === 'paid') {
            if (cancelled) return;
            setNotice({ kind: 'paid', credits: Number(body.credits) || 0 });
            window.history.replaceState(null, '', window.location.pathname);
            onPurchased();
            return;
          }
          if (body.state === 'needs_review') {
            if (!cancelled) setNotice({ kind: 'needs_review' });
            return;
          }
          if (body.state === 'error') {
            if (!cancelled) setNotice({ kind: 'error' });
            return;
          }
          // 'not_paid' or 'pending': the payment may not have landed yet. Wait and ask again.
        } catch {
          // A dropped connection is not a failed payment. Try again.
        }
        await new Promise((resolve) => setTimeout(resolve, VERIFY_GAP_MS));
      }
      if (!cancelled) setNotice({ kind: 'not_paid' });
    })();

    return () => {
      cancelled = true;
    };
  }, [onPurchased]);

  const buy = useCallback(async (priceNaira: number) => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusyPrice(priceNaira);
    setError('');
    try {
      const response = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ priceNaira, returnTo }),
      });
      if (!response.ok) {
        setError(await readError(response, 'Could not open the payment page. Try again.'));
        return;
      }
      const body = (await response.json()) as { authorizationUrl?: string };
      if (!body.authorizationUrl) {
        setError('Could not open the payment page. Try again.');
        return;
      }
      await openPaystackCheckout(body.authorizationUrl);
    } catch {
      setError('Could not reach Urganize. Check your connection and try again.');
    } finally {
      setBusyPrice(null);
    }
  }, [returnTo]);

  if (!isCreditsPurchasable()) return null;

  if (isIOSApp()) {
    return (
      <section aria-labelledby="buy-credits-heading" className="rounded-xl border border-stroke-default p-4">
        <h2 id="buy-credits-heading" className="text-sm font-semibold text-content-primary">
          Buy credits
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          Open Urganize in your browser to buy more credits. They show up here as soon as you do.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="buy-credits-heading" className="rounded-xl border border-stroke-default p-4">
      <h2 id="buy-credits-heading" className="text-sm font-semibold text-content-primary">
        Buy credits
      </h2>
      <p className="mt-1 text-sm text-content-secondary">
        Credits never expire. You pay once, with your card or bank, and they are added straight away.
      </p>

      {notice ? (
        <p role="status" className="mt-3 text-sm text-content-primary">
          {notice.kind === 'pending' ? 'Checking your payment…' : null}
          {notice.kind === 'paid'
            ? `Thank you. ${notice.credits.toLocaleString('en')} credits were added.`
            : null}
          {notice.kind === 'not_paid'
            ? 'We have not seen your payment yet. If you paid, your credits will appear here in a few minutes.'
            : null}
          {notice.kind === 'needs_review'
            ? 'Your payment came through but we need to check it by hand. We will add your credits as soon as we have.'
            : null}
          {notice.kind === 'error' ? 'We could not check your payment. Refresh this page in a minute.' : null}
        </p>
      ) : null}

      {account === null ? (
        <p className="mt-3 text-sm text-content-tertiary">Loading your packs…</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {TOPUP_PACKS.map((pack) => {
            const credits = creditsForPack(account, pack.priceNaira) ?? 0;
            const busy = busyPrice === pack.priceNaira;
            return (
              <li key={pack.priceNaira}>
                <button
                  type="button"
                  onClick={() => void buy(pack.priceNaira)}
                  disabled={busyPrice !== null}
                  className="motion-focus flex w-full items-center justify-between gap-3 rounded-lg border border-stroke-control px-3 py-3 text-left hover:border-content-secondary disabled:opacity-60"
                >
                  <span className="text-sm font-semibold text-content-primary">
                    {credits.toLocaleString('en')} credits
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm text-content-secondary">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {currency === 'USD' ? dollars(packPriceUsd(pack)) : naira(pack.priceNaira)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* No plan (#1164, 2026-11-10): credits pay for the AI only, so say so
          before anyone buys expecting the whole app. */}
      {account === 'credits_only' ? (
        <p className="mt-3 text-sm text-content-primary">
          Credits are for the AI. To plan rollouts and run tasks, pick a plan.
        </p>
      ) : null}

      {account === 'credits_only' || account === 'trial' ? (
        <p className="mt-3 text-xs text-content-tertiary">
          Subscribers get twice the credits for the same price.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
