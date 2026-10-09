'use client';

import { useState } from 'react';
import { InfoTip } from '@/components/shared/HelpTip';
import type { AdminFunnel } from '@/lib/admin-funnel';
import {
  FUNNEL_STEP_COPY,
  WAITLIST_INFO,
  formatConversion,
  formatShare,
  formatTooNew,
  formatWaitlist,
} from '@/lib/admin-funnel-format';

// The sign-up funnel on the founder cockpit (2026-10-09, iteration 2). Display
// only apart from which window is picked: the numbers come worked out from
// GET /api/admin/cockpit (lib/admin-funnel.ts). One column on a phone, five
// steps across from md up.

const number = new Intl.NumberFormat('en');

export function FunnelStrip({ funnels }: { funnels: AdminFunnel[] }) {
  const [windowDays, setWindowDays] = useState<number>(funnels[0]?.windowDays ?? 30);
  const funnel = funnels.find((item) => item.windowDays === windowDays) ?? funnels[0];
  if (!funnel) return null;

  const accounts = funnel.steps[0]?.count ?? 0;
  const tooNew = formatTooNew(funnel);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
            Sign-up funnel
          </p>
          <InfoTip
            label="Sign-up funnel"
            text="Follows the teams that signed up in the window and shows how far each has got by now. Each step is counted on its own, so nobody is hidden for skipping a step; the line under a step is the share of the step before that also got there."
          />
        </div>
        <div role="group" aria-label="Sign-ups from the last" className="flex gap-1">
          {funnels.map((item) => {
            const active = item.windowDays === funnel.windowDays;
            return (
              <button
                key={item.windowDays}
                type="button"
                aria-pressed={active}
                onClick={() => setWindowDays(item.windowDays)}
                className={`motion-focus rounded-full border px-3 py-1 text-xs font-medium ${
                  active
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-stroke-default bg-bg-surface text-content-secondary hover:text-content-primary'
                }`}
              >
                {item.windowDays} days
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
        <div className="flex flex-col gap-1 border-b border-stroke-subtle pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-content-primary">Waitlist</p>
            <InfoTip label="Waitlist" text={WAITLIST_INFO} />
          </div>
          <p className="text-sm tabular-nums text-content-secondary">{formatWaitlist(funnel.waitlist)}</p>
        </div>

        {accounts === 0 ? (
          <p className="pt-3 text-sm text-content-secondary">
            No sign-up in the last {funnel.windowDays} days has had its first 3 days yet.
          </p>
        ) : (
          <ol className="grid grid-cols-1 gap-3 pt-3 md:grid-cols-5">
            {funnel.steps.map((step, index) => {
              const copy = FUNNEL_STEP_COPY[step.key];
              const previous = index > 0 ? funnel.steps[index - 1].count : 0;
              return (
                <li
                  key={step.key}
                  className="flex items-baseline justify-between gap-3 rounded-lg bg-bg-hover px-3 py-2 md:block"
                >
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-content-primary">{copy.label}</p>
                    <InfoTip label={copy.label} text={copy.info} />
                  </div>
                  <div className="text-right md:mt-1 md:text-left">
                    <p className="font-display text-2xl font-semibold tabular-nums text-content-primary">
                      {number.format(step.count)}
                    </p>
                    <p className="text-xs leading-5 text-content-secondary">
                      {index === 0
                        ? `Signed up in ${funnel.windowDays} days`
                        : formatConversion(step, previous)}
                    </p>
                    {index > 0 && step.ofAccounts !== null ? (
                      <p className="text-xs leading-5 text-content-tertiary">
                        {formatShare(step.ofAccounts)} of accounts
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {tooNew ? <p className="mt-2 text-xs leading-5 text-content-tertiary">{tooNew}</p> : null}
    </div>
  );
}
