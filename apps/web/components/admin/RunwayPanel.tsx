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
import { Sheet } from '@/components/admin/Sheet';
import { ToggleGroup, buttonVariants } from '@/components/admin/ui';

// Runway and default alive (iteration 6, 2026-10-10). The figures are typed
// in by hand by the founder. This component holds only the form's own state:
// saving and clearing are done by the page (onSave / onClear), which then
// reloads the cockpit so the numbers are worked out on the server, in one
// place (PUT / DELETE /api/admin/runway, unchanged).
//
// Since 2026-10-18 (approved mock) it is a bottom sheet behind the one Runway
// row on More, instead of a six-field form on top of the page: currency is a
// Naira / Dollar toggle (shadcn ToggleGroup) rather than a select, Spend a
// month and Cash as of share a row, and the explainer is in the title's info
// icon. Once figures are saved the sheet opens on the result, prefilled, with
// Clear. URG-370's fixes stay: min-w-0 on every field so none can widen its
// cell, and field-native on the date so iOS draws it like the inputs.
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

const CURRENCIES: Array<{ value: RunwayCurrency; label: string }> = [
  { value: 'NGN', label: 'Naira ₦' },
  { value: 'USD', label: 'Dollar $' },
];

const FIELD = 'input mt-1 h-11 w-full rounded-xl border-stroke-control bg-bg-elevated';
const LABEL = 'block min-w-0 text-xs font-medium text-content-secondary';

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

const EXPLAINER =
  'Enter cash on hand and what the company spends a month to see runway and whether we are default alive. ';

/** The saved result, at the top of the sheet: runway, default alive, and their live facts. */
function Result({ runway }: { runway: Runway }) {
  const settings = runway.settings;
  if (!settings) return null;
  const facts = [
    runway.runsOutOn ? `Cash runs out around ${formatDay(runway.runsOutOn)} at today's net spend.` : null,
    defaultAliveFact(runway),
    runway.stale ? `Figures are ${runway.ageDays} days old. Update them.` : null,
  ].filter((fact): fact is string => !!fact);
  const other = formatOtherCurrency(settings.cash, settings);
  return (
    <div className="mb-5 rounded-2xl border border-stroke-default bg-bg-elevated p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-2xl font-semibold tabular-nums text-content-primary">
          {formatRunwayMonths(runway)}
        </p>
        <p className="text-sm font-medium text-content-primary">{defaultAliveLabel(runway)}</p>
      </div>
      <p className="mt-1 font-mono text-xs text-content-tertiary">
        {formatMoney(settings.cash, settings.currency)}
        {other ? ` (${other})` : ''} · spend {formatMoney(settings.monthlyBurn, settings.currency)} a month
        {runway.mrr !== null ? ` · MRR ${formatMoney(runway.mrr, settings.currency)}` : ''} · as of {formatDay(settings.asOf)}
      </p>
      {facts.map((fact) => (
        <p key={fact} className="mt-2 text-xs leading-5 text-content-secondary">
          {fact}
        </p>
      ))}
    </div>
  );
}

export function RunwaySheet({
  runway,
  onSave,
  onClear,
  onClose,
}: {
  runway: Runway | null;
  /** Saves the figures; resolves to an error message, or null on success. */
  onSave: (values: RunwayFormValues) => Promise<string | null>;
  onClear: () => Promise<string | null>;
  onClose: () => void;
}) {
  const settings = runway?.settings ?? null;
  const [values, setValues] = useState<RunwayFormValues>(() => initialValues(runway));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = EXPLAINER + (runway ? runwayAssumptions(runway) : '');
  const set = (key: keyof RunwayFormValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const problem = await onSave(values);
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  }

  async function clear() {
    if (typeof window !== 'undefined' && !window.confirm('Clear the saved cash and spend?')) return;
    setBusy(true);
    setError(null);
    const problem = await onClear();
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  }

  return (
    <Sheet title="Runway" info={<InfoTip label="Runway" text={info} overSheet />} onClose={onClose}>
      {runway && settings ? <Result runway={runway} /> : null}
      <form onSubmit={(event) => void submit(event)} aria-label="Runway figures">
        <ToggleGroup
          label="Currency"
          value={values.currency}
          options={CURRENCIES}
          onValueChange={(currency) => setValues((current) => ({ ...current, currency }))}
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className={`${LABEL} col-span-2`}>
            Cash on hand
            <input
              inputMode="numeric"
              required
              value={values.cash}
              onChange={set('cash')}
              placeholder={values.currency === 'NGN' ? '25,000,000' : '20,000'}
              className={FIELD}
            />
          </label>
          <label className={LABEL}>
            Spend a month
            <input
              inputMode="numeric"
              required
              value={values.monthlyBurn}
              onChange={set('monthlyBurn')}
              placeholder={values.currency === 'NGN' ? '2,000,000' : '1,500'}
              className={FIELD}
            />
          </label>
          <label className={LABEL}>
            Cash as of
            <input
              type="date"
              required
              value={values.asOf}
              max={todayLocal()}
              onChange={set('asOf')}
              className={`${FIELD} field-native`}
            />
          </label>
          <label className={`${LABEL} col-span-2`}>
            {values.currency === 'USD' ? 'Naira per dollar' : 'Naira per dollar (optional)'}
            <input
              inputMode="decimal"
              required={values.currency === 'USD'}
              value={values.ngnPerUsd}
              onChange={set('ngnPerUsd')}
              placeholder="1,500"
              className={FIELD}
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-status-error">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className={buttonVariants({ className: 'motion-press mt-5 h-12 w-full text-base disabled:opacity-50' })}
        >
          {busy ? 'Saving…' : 'Save figures'}
        </button>
        {settings ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void clear()}
            className={buttonVariants({ variant: 'ghost', className: 'mt-2 w-full disabled:opacity-50' })}
          >
            Clear the figures
          </button>
        ) : null}
      </form>
    </Sheet>
  );
}
