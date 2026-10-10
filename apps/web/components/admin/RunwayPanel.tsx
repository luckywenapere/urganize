'use client';

import { useState } from 'react';
import { InfoTip } from '@/components/shared/HelpTip';
import type { Runway, RunwayCurrency } from '@/lib/admin-runway';
import {
  defaultAliveFact,
  defaultAliveLabel,
  formatDay,
  formatMoney,
  formatOtherCurrency,
  formatRunwayMonths,
  runwayAssumptions,
} from '@/lib/admin-runway-format';

// Runway and default alive on the founder cockpit (iteration 6, 2026-10-10).
// The figures are typed in here by the founder (the only write on the
// cockpit). This component holds only the form's own state: saving and
// clearing are done by the hub (onSave / onClear), which then reloads the
// cockpit so the numbers are worked out on the server, in one place.
//
// House rule (2026-10-05): what a number means sits behind its info icon; a
// line under a number is a live fact.

export type RunwayFormValues = {
  currency: RunwayCurrency;
  cash: string;
  monthlyBurn: string;
  asOf: string;
  ngnPerUsd: string;
};

function Label({ text, info }: { text: string; info: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">{text}</p>
      <InfoTip label={text} text={info} />
    </div>
  );
}

function Tile({ label, info, value, facts }: { label: string; info: string; value: string; facts: Array<string | null> }) {
  return (
    <div className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <Label text={label} info={info} />
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-content-primary">{value}</p>
      {facts
        .filter((fact): fact is string => !!fact)
        .map((fact) => (
          <p key={fact} className="mt-1 text-xs leading-5 text-content-secondary">
            {fact}
          </p>
        ))}
    </div>
  );
}

function todayLocal(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function initialValues(runway: Runway | null): RunwayFormValues {
  const settings = runway?.settings;
  return {
    currency: settings?.currency ?? 'NGN',
    cash: settings ? String(settings.cash) : '',
    monthlyBurn: settings ? String(settings.monthlyBurn) : '',
    asOf: todayLocal(),
    ngnPerUsd: settings?.ngnPerUsd ? String(settings.ngnPerUsd) : '',
  };
}

export function RunwayPanel({
  runway,
  readable = true,
  onSave,
  onClear,
}: {
  runway: Runway | null;
  /** False when the stored figures could not be read: no form, no zeros. */
  readable?: boolean;
  /** Saves the figures; resolves to an error message, or null on success. */
  onSave?: (values: RunwayFormValues) => Promise<string | null>;
  onClear?: () => Promise<string | null>;
}) {
  const settings = runway?.settings ?? null;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<RunwayFormValues>(() => initialValues(runway));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formOpen = (editing || !settings) && readable && !!onSave;

  const assumptions = runway ? runwayAssumptions(runway) : 'Runway and default alive.';
  const set = (key: keyof RunwayFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!onSave) return;
    setBusy(true);
    setError(null);
    const problem = await onSave(values);
    setBusy(false);
    if (problem) setError(problem);
    else setEditing(false);
  }

  async function clear() {
    if (!onClear) return;
    if (typeof window !== 'undefined' && !window.confirm('Clear the saved cash and spend?')) return;
    setBusy(true);
    setError(null);
    const problem = await onClear();
    setBusy(false);
    if (problem) setError(problem);
    else {
      setValues(initialValues(null));
      setEditing(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label text="Runway and default alive" info={assumptions} />
        {settings && readable && onSave && !editing ? (
          <button
            type="button"
            onClick={() => {
              setValues(initialValues(runway));
              setEditing(true);
            }}
            className="motion-focus text-sm font-medium text-brand hover:underline"
          >
            Update the figures
          </button>
        ) : null}
      </div>

      {!readable ? (
        <p className="mt-3 rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
          Not tracked: the saved figures could not be read just now.
        </p>
      ) : settings && runway ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile
            label="Runway"
            info="Cash on hand ÷ (monthly spend − MRR), counted from the day the cash figure was true."
            value={formatRunwayMonths(runway)}
            facts={[
              runway.runsOutOn ? `Cash runs out around ${formatDay(runway.runsOutOn)} at today's net spend` : null,
              runway.stale ? `Figures are ${runway.ageDays} days old. Update them.` : null,
            ]}
          />
          <Tile
            label="Default alive?"
            info={assumptions}
            value={defaultAliveLabel(runway)}
            facts={[defaultAliveFact(runway)]}
          />
          <Tile
            label="Cash and spend"
            info="As typed in, with today's MRR beside them in the same currency. Dollar amounts use the Naira-per-dollar rate typed with the figures."
            value={formatMoney(settings.cash, settings.currency)}
            facts={[
              formatOtherCurrency(settings.cash, settings),
              `Spend ${formatMoney(settings.monthlyBurn, settings.currency)} a month`,
              runway.mrr !== null ? `MRR ${formatMoney(runway.mrr, settings.currency)}` : null,
              `As of ${formatDay(settings.asOf)}`,
            ]}
          />
        </div>
      ) : !formOpen ? (
        <p className="mt-3 rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
          Not entered yet.
        </p>
      ) : null}

      {formOpen ? (
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-3 rounded-xl border border-stroke-default bg-bg-surface p-4"
          aria-label="Runway figures"
        >
          {!settings ? (
            <p className="text-sm text-content-primary">
              Enter cash on hand and what the company spends a month to see runway and whether we are default alive.
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block text-xs font-medium text-content-secondary">
              Currency
              <select
                value={values.currency}
                onChange={set('currency')}
                className="input mt-1 h-10 w-full rounded-lg border-stroke-control bg-bg-elevated"
              >
                <option value="NGN">Naira (₦)</option>
                <option value="USD">Dollars ($)</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-content-secondary">
              Cash on hand
              <input
                inputMode="decimal"
                required
                value={values.cash}
                onChange={set('cash')}
                placeholder={values.currency === 'NGN' ? '25000000' : '20000'}
                className="input mt-1 h-10 w-full rounded-lg border-stroke-control bg-bg-elevated"
              />
            </label>
            <label className="block text-xs font-medium text-content-secondary">
              Spend a month
              <input
                inputMode="decimal"
                required
                value={values.monthlyBurn}
                onChange={set('monthlyBurn')}
                placeholder={values.currency === 'NGN' ? '2000000' : '1500'}
                className="input mt-1 h-10 w-full rounded-lg border-stroke-control bg-bg-elevated"
              />
            </label>
            <label className="block text-xs font-medium text-content-secondary">
              Cash as of
              <input
                type="date"
                required
                value={values.asOf}
                max={todayLocal()}
                onChange={set('asOf')}
                className="input mt-1 h-10 w-full rounded-lg border-stroke-control bg-bg-elevated"
              />
            </label>
            <label className="block text-xs font-medium text-content-secondary">
              {values.currency === 'USD' ? 'Naira per dollar' : 'Naira per dollar (optional)'}
              <input
                inputMode="decimal"
                required={values.currency === 'USD'}
                value={values.ngnPerUsd}
                onChange={set('ngnPerUsd')}
                placeholder="1500"
                className="input mt-1 h-10 w-full rounded-lg border-stroke-control bg-bg-elevated"
              />
            </label>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-status-error">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="motion-focus motion-press inline-flex h-10 items-center rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save figures'}
            </button>
            {settings ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(false)}
                className="motion-focus inline-flex h-10 items-center rounded-full border border-stroke-default px-4 text-sm font-medium text-content-primary disabled:opacity-50"
              >
                Cancel
              </button>
            ) : null}
            {settings && onClear ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void clear()}
                className="motion-focus text-sm font-medium text-content-secondary hover:underline disabled:opacity-50"
              >
                Clear the figures
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
