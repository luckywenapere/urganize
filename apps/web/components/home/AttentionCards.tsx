'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, AlertCircle } from '@/components/icons';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import type { AttentionItem, AttentionTone } from '@/lib/home/attention';

const TONE: Record<AttentionTone, { badge: string; Icon: typeof AlertCircle }> = {
  urgent: { badge: 'bg-status-error/10 text-status-error', Icon: AlertTriangle },
  warn: { badge: 'bg-status-warning/10 text-status-warning', Icon: AlertCircle },
  good: { badge: 'bg-status-success/10 text-status-success', Icon: CheckCircle2 },
  info: { badge: 'bg-status-info/10 text-status-info', Icon: AlertCircle },
};

/**
 * "For you today": the few things that need a manager now, each with one place
 * to go. The first thing on Home, above the lists, so the answer to "what is on
 * fire" is on screen before anything is read.
 */
const VISIBLE = 3;

export function AttentionCards({ items }: { items: readonly AttentionItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, VISIBLE);
  if (items.length === 0) {
    return (
      <section aria-label="For you today" className="rounded-2xl border border-stroke-default bg-bg-surface p-5">
        <h2 className="font-display text-lg font-semibold text-content-primary">For you today</h2>
        <p className="mt-1 text-sm text-content-secondary">Nothing is on fire. Pick something from your list, or plan the next rollout.</p>
      </section>
    );
  }

  return (
    <section aria-label="For you today">
      <h2 className="mb-3 font-display text-lg font-semibold text-content-primary">For you today</h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((item) => {
          const { badge, Icon } = TONE[item.tone];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                onClick={item.href === '/dashboard' ? leaveReleaseForCatalog : undefined}
                className="motion-focus motion-lift flex h-full items-start gap-3 rounded-2xl border border-stroke-default bg-bg-surface p-4 hover:border-stroke-strong"
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${badge}`} aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-content-primary">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-content-secondary">{item.detail}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand">
                    {item.action}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {items.length > VISIBLE ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="motion-focus mt-2 min-h-11 rounded-lg px-1 text-xs font-semibold text-content-secondary hover:text-content-primary"
        >
          {expanded ? 'Show fewer' : `Show ${items.length - VISIBLE} more`}
        </button>
      ) : null}
    </section>
  );
}
