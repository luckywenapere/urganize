'use client';

// "Your first 14 days" (self-serve checkout, 2026-10-22). A short list on Home
// for a team that paid at checkout: each step links straight to where it is
// done, the card says when it is all done, and goes a day later or when
// closed. Reads its own data and draws nothing on any failure.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { settingsDeepLink } from '@/lib/settings-nav';
import type { ChecklistStep, ChecklistStepId } from '@/lib/self-serve';
import { readStoredFlag, writeStoredFlag } from '@/lib/self-serve-client';

type Card = {
  visible: true;
  allDone: boolean;
  steps: ChecklistStep[];
  summary: string;
  plan: string;
  focusReleaseId: string | null;
};

function hrefFor(id: ChecklistStepId, releaseId: string | null): string | null {
  switch (id) {
    case 'rollout':
      return null;
    case 'cover':
      return releaseId ? `/dashboard?release=${releaseId}&scene=coverart` : null;
    case 'tasks':
      return releaseId ? `/dashboard?release=${releaseId}` : null;
    case 'invite':
      return settingsDeepLink({ segment: 'team' });
    case 'distribute':
      return releaseId ? `/dashboard?release=${releaseId}&scene=distribute` : null;
  }
}

async function authed(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function FirstDaysCard({ userId, onNewRollout }: { userId: string; onNewRollout: () => void }) {
  const [card, setCard] = useState<Card | null>(null);
  const reported = useRef(false);

  const load = useCallback(async () => {
    try {
      const token = await authed();
      if (!token) return;
      const response = await fetch('/api/home/first-days', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const payload = (await response.json()) as Card | { visible: false };
      setCard(payload.visible ? payload : null);
    } catch {
      // Home never shows a broken card.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // checklist_step_done once per step per account on this device.
  useEffect(() => {
    if (!card || reported.current) return;
    reported.current = true;
    for (const step of card.steps) {
      const key = `urganize.first-days.${userId}.${step.id}`;
      if (step.done && !readStoredFlag(key)) {
        writeStoredFlag(key);
        captureAnalyticsEvent(createPostHogEvent('checklist_step_done', { path: 'self_serve', plan: card.plan, step: step.id }), {
          userId,
        });
      }
    }
  }, [card, userId]);

  if (!card) return null;

  const dismiss = async () => {
    setCard(null);
    captureAnalyticsEvent(createPostHogEvent('checklist_dismissed', { path: 'self_serve', plan: card.plan }), { userId });
    const token = await authed();
    if (!token) return;
    await fetch('/api/home/first-days', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss' }),
    }).catch(() => undefined);
  };

  const closeButton = (
    <button
      type="button"
      onClick={() => void dismiss()}
      aria-label="Close your first 14 days"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
    >
      ×
    </button>
  );

  if (card.allDone) {
    return (
      <section className="mt-5 flex items-center justify-between gap-3 rounded-[20px] border border-stroke-default bg-bg-surface px-5 py-3">
        <p className="flex items-center gap-3">
          <Tick done />
          <span>
            <b className="font-semibold text-content-primary">You&apos;re set up.</b>{' '}
            <span className="text-content-secondary">This card goes tomorrow.</span>
          </span>
        </p>
        {closeButton}
      </section>
    );
  }

  const done = card.steps.filter((step) => step.done).length;

  return (
    <section aria-labelledby="first-days-title" className="mt-5 rounded-[20px] border border-stroke-default bg-bg-surface px-5 pb-2 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="first-days-title" className="text-base font-semibold text-content-primary">
            Your first 14 days
          </h2>
          <p className="mt-0.5 text-sm text-content-secondary">{card.summary}</p>
        </div>
        {closeButton}
      </div>
      <div className="mb-1.5 mt-3 h-1.5 rounded-full bg-stroke-strong" aria-hidden="true">
        <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.round((done / card.steps.length) * 100)}%` }} />
      </div>
      <ul className="divide-y divide-stroke-subtle">
        {card.steps.map((step) => {
          const href = hrefFor(step.id, card.focusReleaseId);
          const label = (
            <span className="flex items-center gap-3">
              <Tick done={step.done} />
              <span className={step.done ? 'text-content-tertiary line-through' : 'text-content-primary'}>{step.label}</span>
            </span>
          );
          const trailing = step.done ? null : (
            <span className="flex items-center gap-2.5 text-content-tertiary">
              {step.progress ? <span className="font-mono text-sm">{step.progress}</span> : null}
              <span aria-hidden="true">›</span>
            </span>
          );
          const rowClass = 'flex min-h-14 w-full items-center justify-between gap-3 text-left';
          return (
            <li key={step.id}>
              {step.done ? (
                <div className={rowClass}>{label}</div>
              ) : step.id === 'rollout' || !href ? (
                <button type="button" onClick={onNewRollout} className={`${rowClass} hover:opacity-80`}>
                  {label}
                  {trailing}
                </button>
              ) : (
                <Link href={href} className={`${rowClass} hover:opacity-80`}>
                  {label}
                  {trailing}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Tick({ done = false }: { done?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
        done ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-control'
      }`}
    >
      {done ? '✓' : null}
    </span>
  );
}
