'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, X } from '@/components/icons';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import type { OnboardingProgress } from '@/lib/home/onboarding';

const STORAGE_KEY = 'urganize.home.onboarding-closed';

function readClosed(): boolean {
  return readPersistedState<{ closed: boolean }>(STORAGE_KEY, 1, (value): value is { closed: boolean } =>
    typeof value === 'object' && value !== null && typeof (value as { closed?: unknown }).closed === 'boolean'
  )?.closed === true;
}

/** Getting started: a progress bar and the next step. Hides itself at 100% and
 *  when closed, and the close is remembered on this device. */
export function OnboardingBar({ progress }: { progress: OnboardingProgress }) {
  const [closed, setClosed] = useState(true);
  useEffect(() => {
    setClosed(readClosed());
  }, []);

  if (progress.complete || closed) return null;
  const next = progress.steps.find((step) => !step.done);

  return (
    <section aria-label="Getting started" className="rounded-2xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-content-primary">Getting started</h2>
          <p className="mt-0.5 text-sm text-content-secondary">
            {progress.doneCount} of {progress.steps.length} done
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setClosed(true);
            writePersistedState(STORAGE_KEY, 1, { closed: true });
          }}
          aria-label="Hide getting started"
          className="motion-focus grid h-11 w-11 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Getting started progress"
        className="mt-3 h-1.5 w-full rounded-full bg-stroke-default"
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
      </div>
      <ul className="mt-4 grid gap-2">
        {progress.steps.map((step) => (
          <li key={step.key} className="flex items-center gap-2.5 text-sm">
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                step.done ? 'bg-brand text-content-inverse' : 'border border-stroke-control'
              }`}
              aria-hidden="true"
            >
              {step.done ? <Check className="h-3 w-3" /> : null}
            </span>
            {step.done ? (
              <span className="text-content-tertiary line-through">{step.label}</span>
            ) : (
              <Link href={step.href} className="motion-focus font-medium text-content-primary hover:text-brand">
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {next ? <span className="sr-only">Next step: {next.label}</span> : null}
    </section>
  );
}
