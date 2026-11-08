'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from '@/components/icons';
import { authHeaders } from '@/components/press-kits/press-kit-client';
import { isAddonReference } from '@/lib/addons';
import { isIOSApp } from '@/lib/platform';
import { panelClass } from './panelClass';

/**
 * Add-ons on top of the plan (#1112, mocks docs/mocks/pricing-addons section 2):
 * extra people and artists on Manager and Pro, distribution per artist on Solo
 * and Manager. Each buy opens Paystack for the first period (card only, which
 * saves the card for renewals); the limit goes up as soon as it is paid.
 */

type Addon = {
  id: string;
  kind: 'person' | 'artist' | 'distribution';
  quantity: number;
  interval: 'monthly' | 'yearly';
  artistName: string | null;
  priceKobo: number;
  status: 'active' | 'paused';
  live: boolean;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
};

type AddonsState = {
  tier: string | null;
  paying: boolean;
  canBuy: boolean;
  card: string | null;
  can: { person: boolean; artist: boolean; distribution: boolean };
  prices: { person: number; artist: number; distribution_monthly: number; distribution_yearly: number };
  limits: { seats: { base: number; extra: number } | null; artists: { base: number; extra: number } | null };
  addons: Addon[];
  artists: Array<{ id: string; name: string; hasDistribution: boolean }>;
};

const RETURN_TO = '/dashboard?settings=billing';
const naira = (value: number): string => `₦${Math.round(value).toLocaleString('en')}`;
const errorOf = (data: Record<string, unknown>): string => (typeof data.error === 'string' ? data.error : '');

function day(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function addonName(addon: Addon): string {
  if (addon.kind === 'distribution') return `Distribution for ${addon.artistName || 'an artist'}`;
  if (addon.kind === 'person') return addon.quantity === 1 ? '1 extra person' : `${addon.quantity} extra people`;
  return addon.quantity === 1 ? '1 extra artist' : `${addon.quantity} extra artists`;
}

function addonDetail(addon: Addon): string {
  const price = `${naira(addon.priceKobo / 100)} a ${addon.interval === 'yearly' ? 'year' : 'month'}`;
  if (addon.status === 'paused') return `${price} · paused, not paid`;
  if (addon.cancelAtPeriodEnd) return `${price} · ends ${day(addon.renewsAt)}`;
  const plan = addon.kind === 'distribution' ? (addon.interval === 'yearly' ? 'TRM yearly · ' : 'TRM monthly · ') : '';
  return `${plan}${price} · renews ${day(addon.renewsAt)}`;
}

const STEP = 'motion-focus grid h-8 w-8 place-items-center text-content-secondary hover:bg-bg-hover disabled:opacity-40';
const BUTTON =
  'motion-focus motion-press inline-flex h-9 items-center justify-center gap-2 border border-brand/25 bg-brand px-3.5 text-[13.5px] font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50';
const OUTLINE =
  'motion-focus motion-press inline-flex h-9 items-center justify-center gap-2 border border-stroke-strong px-3.5 text-[13.5px] font-semibold text-content-primary hover:bg-bg-hover disabled:opacity-50';
const LINK = 'motion-focus text-[13px] text-content-secondary underline underline-offset-2 hover:text-content-primary';

export function AddonsSection() {
  const [state, setState] = useState<AddonsState | null>(null);
  const [people, setPeople] = useState(1);
  const [artists, setArtists] = useState(1);
  const [artistId, setArtistId] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const ranReturn = useRef(false);

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const response = await fetch('/api/billing/addons', { headers, cache: 'no-store' });
    if (response.ok) setState((await response.json()) as AddonsState);
  }, []);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const headers = await authHeaders();
    if (!headers) return { ok: false, data: { error: 'Sign in again.' } as Record<string, unknown> };
    const response = await fetch('/api/billing/addons', {
      method: 'POST',
      headers: { ...(headers as Record<string, string>), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: response.ok, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Back from Paystack: settle the add-on (the webhook does too), then reload.
  useEffect(() => {
    if (ranReturn.current) return;
    ranReturn.current = true;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref') || '';
    if (!isAddonReference(reference)) return;
    const clean = new URL(window.location.href);
    for (const key of ['reference', 'trxref', 'payment']) clean.searchParams.delete(key);
    window.history.replaceState(null, '', clean.toString());
    let stopped = false;
    const settle = async (tries: number) => {
      const result = await post({ action: 'verify', reference });
      if (stopped) return;
      const outcome = String(result.data.state || '');
      if (outcome === 'paid') {
        setMessage('Paid. Your add-on is on.');
        await load();
      } else if (outcome === 'pending' && tries > 0) window.setTimeout(() => void settle(tries - 1), 3000);
      else if (outcome === 'not_paid') setMessage('The payment did not go through. Nothing was charged.');
      else setMessage('We are checking your payment. Refresh in a minute.');
    };
    void settle(5);
    return () => {
      stopped = true;
    };
  }, [load, post]);

  if (!state || !state.paying) return null;
  const anything = state.can.person || state.can.artist || state.can.distribution;
  if (!anything && state.addons.length === 0) return null;

  const buy = async (key: string, body: Record<string, unknown>) => {
    setError('');
    setMessage('');
    setBusy(key);
    const result = await post({ action: 'checkout', returnTo: RETURN_TO, ...body });
    const url = typeof result.data.authorizationUrl === 'string' ? result.data.authorizationUrl : '';
    if (result.ok && url) {
      window.location.assign(url);
      return;
    }
    setBusy(null);
    setError(errorOf(result.data) || 'Could not open the payment page. Try again.');
  };

  const change = async (key: string, body: Record<string, unknown>, done: string) => {
    setError('');
    setMessage('');
    setBusy(key);
    const result = await post(body);
    setBusy(null);
    if (result.ok) {
      setMessage(done);
      await load();
    } else setError(errorOf(result.data) || 'Could not change that. Try again.');
  };

  const monthly = state.addons
    .filter((addon) => addon.status === 'active' && !addon.cancelAtPeriodEnd && addon.interval === 'monthly')
    .reduce((total, addon) => total + addon.priceKobo / 100, 0);
  const paused = state.addons.filter((addon) => addon.status === 'paused');
  const pausedTotal = paused.reduce((total, addon) => total + addon.priceKobo / 100, 0);
  const freeArtists = state.artists.filter((artist) => !artist.hasDistribution);
  const pickedArtist = artistId || freeArtists[0]?.id || '';
  const ios = isIOSApp();
  const canPay = state.canBuy && !ios;

  return (
    <section className={panelClass}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Add-ons</h2>

      {paused.length > 0 ? (
        <div className="mb-4 border border-status-error/30 bg-status-error/5 p-4">
          <p className="text-sm text-content-primary">
            <span className="font-semibold text-status-error">Your add-ons are paused.</span> We could not charge{' '}
            {naira(pausedTotal)}. {paused.map(addonName).join(', ')} {paused.length === 1 ? 'is' : 'are'} on hold.
          </p>
          {canPay ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void change('resume', { action: 'resume' }, 'Paid. Your add-ons are back on.')}
              className={`${BUTTON} mt-3`}
            >
              Pay {naira(pausedTotal)} now
            </button>
          ) : null}
        </div>
      ) : null}

      <ul className="divide-y divide-stroke-subtle border-y border-stroke-subtle">
        {state.addons
          .filter((addon) => addon.status === 'active')
          .map((addon) => (
            <li key={addon.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-content-primary">{addonName(addon)}</p>
                <p className="text-[12.5px] text-content-secondary">{addonDetail(addon)}</p>
              </div>
              {state.canBuy ? (
                addon.cancelAtPeriodEnd ? (
                  <button type="button" disabled={busy !== null} className={LINK} onClick={() => void change(addon.id, { action: 'keep', addonId: addon.id }, 'Kept.')}>
                    Keep
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    className={LINK}
                    onClick={() => void change(addon.id, { action: 'cancel', addonId: addon.id }, `Removed. It stops on ${day(addon.renewsAt)}.`)}
                  >
                    Remove
                  </button>
                )
              ) : null}
            </li>
          ))}

        {state.can.person ? (
          <li className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content-primary">Extra people</p>
              <p className="text-[12.5px] text-content-secondary">
                {naira(state.prices.person)} a month each
                {state.limits.seats ? ` · you have ${state.limits.seats.base} + ${state.limits.seats.extra}` : ''}
              </p>
            </div>
            {canPay ? (
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center border border-stroke-strong">
                  <button type="button" className={STEP} aria-label="One fewer" disabled={people <= 1} onClick={() => setPeople((n) => Math.max(1, n - 1))}>
                    −
                  </button>
                  <span className="min-w-7 text-center font-mono text-sm">{people}</span>
                  <button type="button" className={STEP} aria-label="One more" disabled={people >= 20} onClick={() => setPeople((n) => Math.min(20, n + 1))}>
                    +
                  </button>
                </div>
                <button type="button" disabled={busy !== null} className={BUTTON} onClick={() => void buy('person', { kind: 'person', quantity: people })}>
                  {busy === 'person' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Pay {naira(state.prices.person * people)}
                </button>
              </div>
            ) : null}
          </li>
        ) : null}

        {state.can.artist ? (
          <li className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content-primary">Extra artists</p>
              <p className="text-[12.5px] text-content-secondary">
                {naira(state.prices.artist)} a month each
                {state.limits.artists ? ` · you have ${state.limits.artists.base} + ${state.limits.artists.extra}` : ''}
              </p>
            </div>
            {canPay ? (
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center border border-stroke-strong">
                  <button type="button" className={STEP} aria-label="One fewer" disabled={artists <= 1} onClick={() => setArtists((n) => Math.max(1, n - 1))}>
                    −
                  </button>
                  <span className="min-w-7 text-center font-mono text-sm">{artists}</span>
                  <button type="button" className={STEP} aria-label="One more" disabled={artists >= 20} onClick={() => setArtists((n) => Math.min(20, n + 1))}>
                    +
                  </button>
                </div>
                <button type="button" disabled={busy !== null} className={BUTTON} onClick={() => void buy('artist', { kind: 'artist', quantity: artists })}>
                  {busy === 'artist' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Pay {naira(state.prices.artist * artists)}
                </button>
              </div>
            ) : null}
          </li>
        ) : null}

        {state.can.distribution ? (
          <li className="py-3">
            <p className="text-sm font-semibold text-content-primary">Distribution for an artist</p>
            <p className="text-[12.5px] text-content-secondary">
              {naira(state.prices.distribution_monthly)} a month (7 releases a month, singles and EPs) or{' '}
              {naira(state.prices.distribution_yearly)} a year (no limit, albums too)
            </p>
            {canPay && freeArtists.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  aria-label="Artist"
                  value={pickedArtist}
                  onChange={(event) => setArtistId(event.target.value)}
                  className="h-9 border border-stroke-control bg-bg-base px-2 text-sm text-content-primary"
                >
                  {freeArtists.map((artist) => (
                    <option key={artist.id} value={artist.id}>
                      {artist.name}
                    </option>
                  ))}
                </select>
                <div className="inline-flex border border-stroke-strong text-[13px]">
                  {(['monthly', 'yearly'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPeriod(value)}
                      className={`h-9 px-3 ${period === value ? 'bg-bg-hover font-semibold text-content-primary' : 'text-content-secondary'}`}
                    >
                      {value === 'monthly' ? 'Monthly' : 'Yearly'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={busy !== null || !pickedArtist}
                  className={OUTLINE}
                  onClick={() => void buy('distribution', { kind: 'distribution', artistId: pickedArtist, interval: period })}
                >
                  {busy === 'distribution' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Add · {naira(period === 'yearly' ? state.prices.distribution_yearly : state.prices.distribution_monthly)}
                </button>
              </div>
            ) : canPay ? (
              <p className="mt-2 text-[12.5px] text-content-tertiary">Add an artist first.</p>
            ) : null}
          </li>
        ) : null}

        {state.tier === 'solo' ? (
          <li className="flex items-center justify-between gap-3 py-3 opacity-70">
            <div>
              <p className="text-sm font-semibold text-content-primary">More people or artists</p>
              <p className="text-[12.5px] text-content-secondary">Come with Pro, ₦15,000 a month</p>
            </div>
            <Link href="/locked?intent=upgrade" className={LINK}>
              See plans
            </Link>
          </li>
        ) : null}
      </ul>

      {monthly > 0 ? (
        <p className="mt-3 font-mono text-[11.5px] text-content-secondary">Add-ons: {naira(monthly)} a month, on top of your plan.</p>
      ) : null}
      <p className="mt-2 text-[12.5px] text-content-tertiary">
        {state.canBuy
          ? `Paid by card${state.card ? ` (${state.card})` : ''}. Each add-on renews on its own date. Remove one any time; it stops when its paid time ends.`
          : 'The person who runs your team adds these.'}
      </p>
      {message ? <p role="status" className="mt-3 text-sm text-content-secondary">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-status-error">{error}</p> : null}
    </section>
  );
}
