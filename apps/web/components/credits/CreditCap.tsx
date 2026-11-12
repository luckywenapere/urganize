'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from '@/components/icons';
import { authHeaders } from '@/components/press-kits/press-kit-client';
import { isCardCheckReference } from '@/lib/addons';
import { isIOSApp } from '@/lib/platform';
import { creditMeter, overageIsOn } from '@/lib/credits/history';

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

/**
 * `variant="desk"` (#1226, docs/mocks/account-team-desktop): the computer's AI
 * credits page. The balance is a big number with a meter, and paying past your
 * credits is a switch that reads off at a ₦0 cap, which is exactly the
 * existing "off". Turning it on only shows the limit field; nothing is saved or
 * charged until Save, and turning it off saves ₦0. Same calls, same rules.
 */
export function CreditCap({
  fallback,
  onChange,
  variant = 'stack',
}: {
  fallback?: ReactNode;
  onChange?: () => void;
  variant?: 'stack' | 'desk';
}) {
  const [switchOpen, setSwitchOpen] = useState(false);
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

  const saveCap = async (value: string = draft) => {
    setError('');
    setMessage('');
    setBusy(true);
    const result = await post('PUT', { capNaira: value });
    setBusy(false);
    if (result.ok) {
      setMessage('Saved.');
      setSwitchOpen(false);
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

  if (variant === 'desk') {
    const meter = creditMeter({ balance: state.balance, allowance: state.allowance });
    const saved = overageIsOn(state.capNaira);
    const on = saved || switchOpen;
    const toggle = () => {
      setError('');
      setMessage('');
      if (!on) {
        setSwitchOpen(true);
        setDraft('');
        return;
      }
      if (saved) {
        // Off is the existing ₦0 cap.
        void saveCap('0');
        return;
      }
      setSwitchOpen(false);
      setDraft(String(state.capNaira));
    };
    return (
      <section className="space-y-4">
        <div className="rounded-2xl border border-stroke-default bg-bg-surface p-5">
          <p className="text-sm text-content-secondary">Left this month</p>
          <p className="mt-1 font-display text-[40px] leading-[44px] text-content-primary">
            {meter.left.toLocaleString('en')}
            {meter.of > 0 && meter.left <= meter.of ? (
              <span className="ml-2 font-sans text-[15px] text-content-secondary">of {meter.of.toLocaleString('en')}</span>
            ) : null}
          </p>
          {meter.of > 0 ? (
            <div
              className="mb-2 mt-3 h-2 overflow-hidden rounded-full bg-bg-hover"
              role="meter"
              aria-label="Credits left this month"
              aria-valuemin={0}
              aria-valuemax={meter.of}
              aria-valuenow={Math.min(meter.left, meter.of)}
            >
              <div className="h-full rounded-full bg-brand" style={{ width: `${meter.share}%` }} />
            </div>
          ) : null}
          <p className="text-[13px] text-content-secondary">More arrive on {day(state.nextGrantAt)}.</p>
        </div>

        <div className="rounded-2xl border border-stroke-default bg-bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <span id="credit-overage-label" className="text-sm font-semibold text-content-primary">
              Keep going when they run out
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby="credit-overage-label"
              disabled={busy || !state.canEdit}
              onClick={toggle}
              className={`motion-focus relative h-5 w-8 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-brand' : 'bg-content-primary/15'}`}
            >
              <span
                className={`absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-[left] ${on ? 'left-[15px]' : 'left-[3px]'}`}
              />
            </button>
          </div>
          {saved ? (
            <>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-hover" aria-hidden="true">
                <div className={`h-full ${atCap ? 'bg-status-error' : 'bg-brand'}`} style={{ width: `${capShare}%` }} />
              </div>
              <p className="mt-2 text-[13px] text-content-secondary">
                On. {(state.used?.credits ?? 0).toLocaleString('en')} credits, {naira(spent)} of your {naira(state.capNaira)} limit
                this month, at {naira(state.rateNaira ?? 0)} a credit.
              </p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-content-secondary">
              {on ? 'Pay ' : `Off. AI stops until ${day(state.nextGrantAt)}. Turn on to pay `}
              {naira(state.rateNaira ?? 0)} a credit, up to a limit you set.
            </p>
          )}

          {on && state.canEdit ? (
            <div className="mt-3">
              <label htmlFor="credit-cap" className="text-[13px] text-content-secondary">
                Limit a month
              </label>
              <div className="mt-1.5 flex gap-2">
                <div className="flex h-10 min-w-0 flex-1 items-center rounded-[10px] border border-stroke-control bg-bg-base px-3">
                  <span className="text-content-tertiary">₦</span>
                  <input
                    id="credit-cap"
                    inputMode="numeric"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
                    className="ml-1 w-full min-w-0 bg-transparent text-[15px] text-content-primary focus:outline-none"
                  />
                  <span className="ml-2 shrink-0 text-xs text-content-tertiary">a month</span>
                </div>
                <button
                  type="button"
                  disabled={busy || !draft}
                  onClick={() => void saveCap()}
                  className="motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save
                </button>
              </div>
              <p className="mt-2 text-[13px] text-content-secondary">
                {state.card ? `Charged to your ${state.card} on ${day(state.nextGrantAt)}.` : 'Needs a card on file.'}
              </p>
              {!state.card && !isIOSApp() ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addCard()}
                  className="motion-focus motion-press mt-3 inline-flex h-9 items-center rounded-full border border-stroke-control px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-50"
                >
                  Add a card
                </button>
              ) : null}
            </div>
          ) : null}
          {!state.canEdit ? (
            <p className="mt-3 text-[13px] text-content-secondary">The person who runs your team sets this.</p>
          ) : null}
        </div>

        {state.unpaidNaira > 0 ? (
          <div className="rounded-2xl border border-status-error/30 bg-status-error/5 p-5">
            <p className="text-sm text-content-primary">
              <span className="font-semibold text-status-error">We could not charge {naira(state.unpaidNaira)}</span> for
              credits used past your monthly credits. Extra credits are paused until it is paid.
            </p>
            {state.canEdit ? (
              <button type="button" disabled={busy} onClick={() => void payNow()} className={`${BUTTON} mt-3 rounded-full`}>
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
