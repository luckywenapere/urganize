'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from '@/components/icons';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { comingSoonFor } from '@/lib/coming-soon';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { PageHeader } from './PageHeader';

const KEY_PREFIX = 'urganize.shell.interest.';

/**
 * The screen an unbuilt area opens to, in the place its real page will be
 * (founder call, 2026-10-04: areas are not greyed out; they open and say what is
 * coming).
 *
 * One layout for every width on purpose. A pop-up is easy to dismiss by accident
 * on a phone and strands the person on a blank page behind it, and on a desktop
 * it covers the very tab they just chose. A page in the content area answers
 * both: it keeps the top bar and the section tabs, so the person can leave in one
 * tap whichever way they came.
 *
 * "Tell me when it is ready" is the demand signal: it records interest once per
 * area per browser and sends one event, so the next area to build is chosen from
 * what people asked for. It takes nothing but a tap, since we already know who
 * they are.
 */
export function ComingSoon({ area }: { area: string }) {
  const copy = comingSoonFor(area);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    const saved = readPersistedState(
      `${KEY_PREFIX}${area}`,
      1,
      (value): value is boolean => typeof value === 'boolean'
    );
    if (saved === true) setAsked(true);
    captureAnalyticsEvent({ name: 'coming_soon_viewed', properties: { area } });
  }, [area]);

  if (!copy) return null;

  const ask = () => {
    setAsked(true);
    try {
      writePersistedState(`${KEY_PREFIX}${area}`, 1, true);
    } catch {
      // Not remembering the tap costs a repeat tap, nothing else.
    }
    captureAnalyticsEvent({ name: 'coming_soon_interest', properties: { area } });
  };

  return (
    <div>
      <PageHeader title={copy.title} description={copy.question} />
      <section className="max-w-2xl rounded-2xl border border-stroke-default bg-bg-surface p-6 sm:p-8">
        <span className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
          Coming soon
        </span>
        <h2 className="mt-4 font-display text-2xl font-semibold text-content-primary">
          What you will be able to do here
        </h2>
        <ul className="mt-4 space-y-3">
          {copy.willDo.map((line) => (
            <li key={line} className="flex gap-3 text-base leading-6 text-content-secondary">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={ask}
            disabled={asked}
            aria-live="polite"
            className="motion-focus motion-press inline-flex h-11 items-center justify-center rounded-full bg-content-primary px-5 text-sm font-semibold text-content-inverse disabled:cursor-default disabled:opacity-70"
          >
            {asked ? 'Got it. We will tell you.' : 'Tell me when it is ready'}
          </button>
          {copy.meanwhile ? (
            <Link
              href={copy.meanwhile.href}
              className="motion-focus inline-flex h-11 items-center rounded-full px-4 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              {copy.meanwhile.label}
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
