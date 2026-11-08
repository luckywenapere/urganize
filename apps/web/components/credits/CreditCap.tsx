'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from '@/components/icons';
import { authHeaders } from '@/components/press-kits/press-kit-client';
import { isCardCheckReference } from '@/lib/addons';
import { isIOSApp } from '@/lib/platform';

/**
 * AI credits past the plan's monthly credits (#1112, mocks docs/mocks/pricing-addons
 * section 3). Two bars: the monthly credits, then money spent past them against
 * the cap the owner sets. Only for a paying team; anyone else sees `fallback`
 * (the credit packs, for teams with no plan).
 */

type CapState = {
  eligible: boolean;
  canEdit: boolean;
  rateNaira: number | null;
  capNaira: number;
  allowance: number;
  balance: number | null;
  nextGrantAt: string | null;
  used: { credits: number; spentNaira: number } | null;
  card: string | null;
  unpaidNaira: number;
};

const errorOf = (data: Record<string, unknown>): string => (typeof data.error === 'string' ? data.error : '');

const naira = (value: number): string => `₦${Math.round(value).toLocaleString('en')}`;

function day(iso: string | null): string {
  if (!iso) return 'your next billing day';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 'your next billing day' : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50';
const OUTLINE =
  'motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 border border-stroke-strong px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-50';

export function CreditCap({ fallback, onChange }: { fallback?: ReactNode; onChange?: () => void }) {
  const [state, setState] = useState<CapState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const ranReturn = useRef(false);

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return setLoaded(true);
    try {
      const response = await fetch('/api/billing/credit-cap', { headers, cache: 'no-store' });
      if (response.ok) {
        const next = (await response.json()) as CapState;
        setState(next);
        setDraft(String(next.capNaira));
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  const post = useCallback(async (method: 'POST' | 'PUT', body: Record<string, unknown>) => {
    const headers = await authHeaders();
    if (!headers) return { ok: false, data: { error: 'Sign in again.' } as Record<string, unknown> };
    const response = await fetch('/api/billing/credit-cap', {
      method,
      headers: { ...(headers as Record<string, string>), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, data };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Back from the ₦100 card check: save the card, then the cap can be set.
  useEffect(() => {
    if (ranReturn.current) return;
    ranReturn.current = true;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref') || '';
    if (!isCardCheckReference(reference)) return;
    const clean = new URL(window.location.href);
    for (const key of ['reference', 'trxref']) clean.searchParams.delete(key);
    window.history.replaceState(null, '', clean.toString());
    void (async () => {
      const result = await post('POST', { action: 'card_verify', reference });
      if (result.ok) {
        setMessage(`Card saved. Your ₦100 is on its way back.`);
        await load();
      } else setError(errorOf(result.data) || 'We could not save that card.');
    })();
  }, [load, post]);

  if (!loaded) return null;
  if (!state || !state.eligible) return <>{fallback ?? null}</>;

  const allowanceUsed = Math.max(0, state.allowance - Math.max(0, state.balance ?? 0));
  const allowanceShare = state.allowance > 0 ? Math.min(100, Math.round((allowanceUsed / state.allowance) * 100)) : 0;
  const spent = state.used?.spentNaira ?? 0;
  const capShare = state.capNaira > 0 ? Math.min(100, Math.round((spent / state.capNaira) * 100)) : 0;
  const atCap = state.capNaira > 0 && spent >= state.capNaira;

  const saveCap = async () => {
    setError('');
    setMessage('');
    setBusy(true);
    const result = await post('PUT', { capNaira: draft });
    setBusy(false);
    if (result.ok) {
      setMessage('Saved.');
      await load();
      onChange?.();
    } else if (result.data.needsCard) setError('Add a card first. We check it with ₦100 and send it back.');
    else setError(errorOf(result.data) || 'Could not save the cap.');
  };

  const addCard = async () => {
    setError('');
    setBusy(true);
    const result = await post('POST', { action: 'card_checkout' });
    const url = typeof result.data.authorizationUrl === 'string' ? result.data.authorizationUrl : '';
    if (result.ok && url) {
      window.location.assign(url);
      return;
    }
    setBusy(false);
    setError(errorOf(result.data) || 'Could not open the payment page.');
  };

  const payNow = async () => {
    setError('');
    setBusy(true);
    const result = await post('POST', { action: 'pay_now' });
    setBusy(false);
    if (result.ok) {
      setMessage('Paid. Thank you.');
      await load();
    } else setError(errorOf(result.data) || 'Your card was not charged.');
  };

  return (
    <section className="space-y-3">
      <div className="border border-stroke-default bg-bg-surface p-4">
        <p className="text-[15px] font-semibold text-content-primary">
          {state.allowance.toLocaleString('en')} credits a month on your plan
        </p>
        <div className="mt-3 h-1.5 bg-stroke-default" aria-hidden="true">
          <div className="h-1.5 bg-brand" style={{ width: `${allowanceShare}%` }} />
        </div>
        <p className="mt-2 font-mono text-[11.5px] text-content-secondary">
          {Math.max(0, state.balance ?? 0).toLocaleString('en')} left · more arrive {day(state.nextGrantAt)}
        </p>
      </div>

      <div className="border border-stroke-default bg-bg-surface p-4">
        <p className="text-[15px] font-semibold text-content-primary">
          Past your monthly credits · {naira(state.rateNaira ?? 0)} a credit
        </p>
        {state.capNaira > 0 ? (
          <>
            <div className="mt-3 h-1.5 bg-stroke-default" aria-hidden="true">
              <div className={`h-1.5 ${atCap ? 'bg-status-error' : 'bg-brand'}`} style={{ width: `${capShare}%` }} />
            </div>
            <p className="mt-2 font-mono text-[11.5px] text-content-secondary">
              {(state.used?.credits ?? 0).toLocaleString('en')} credits · {naira(spent)} of your {naira(state.capNaira)} cap
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-content-secondary">
            Off. AI stops when your monthly credits run out. Set a cap to keep going.
          </p>
        )}

        {state.canEdit ? (
          <div className="mt-4">
            <label htmlFor="credit-cap" className="text-xs text-content-secondary">
              Monthly cap
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <div className="flex h-10 flex-1 items-center border border-stroke-control bg-bg-base px-3">
                <span className="text-content-tertiary">₦</span>
                <input
                  id="credit-cap"
                  inputMode="numeric"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
                  className="ml-1 w-full bg-transparent text-[15px] text-content-primary focus:outline-none"
                />
                <span className="ml-2 shrink-0 text-xs text-content-tertiary">a month</span>
              </div>
              <button type="button" disabled={busy} onClick={() => void saveCap()} className={BUTTON}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save cap
              </button>
            </div>
            <p className="mt-2 font-mono text-[11.5px] text-content-secondary">
              {state.card
                ? `Charged to your ${state.card} on ${day(state.nextGrantAt)}.`
                : 'Needs a card on file. ₦0 keeps it off.'}
            </p>
            {!state.card && !isIOSApp() ? (
              <button type="button" disabled={busy} onClick={() => void addCard()} className={`${OUTLINE} mt-3`}>
                Add a card
              </button>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-content-secondary">The person who runs your team sets the cap.</p>
        )}
      </div>

      {state.unpaidNaira > 0 ? (
        <div className="border border-status-error/30 bg-status-error/5 p-4">
          <p className="text-sm text-content-primary">
            <span className="font-semibold text-status-error">We could not charge {naira(state.unpaidNaira)}</span> for
            credits used past your monthly credits. Extra credits are paused until it is paid.
          </p>
          {state.canEdit ? (
            <button type="button" disabled={busy} onClick={() => void payNow()} className={`${BUTTON} mt-3`}>
              Pay {naira(state.unpaidNaira)} now
            </button>
          ) : null}
        </div>
      ) : null}

      {message ? <p role="status" className="text-sm text-content-secondary">{message}</p> : null}
      {error ? <p role="alert" className="text-sm text-status-error">{error}</p> : null}
    </section>
  );
}
