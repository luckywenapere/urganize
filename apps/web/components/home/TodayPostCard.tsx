'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { artistHref, isArtistPageEnabled } from '@/lib/artist-page';
import { PLATFORM_LABELS, nextDayWords } from '@/lib/posting-plan';
import {
  POSTING_PLAN_CHANGED_EVENT,
  fetchTodayPlan,
  setPostStatus,
  type TodayPlan,
  type TodayPost,
} from '@/lib/posting-plan-client';

const ENABLED = isArtistPageEnabled();

/**
 * Today's post on Home (posting plan, 2026-10-27): a reason to open the app
 * between releases. Done or Skip right here. Draws nothing for a team with no
 * posts planned this week or next.
 */
export function TodayPostCard() {
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setPlan(await fetchTodayPlan()), []);

  useEffect(() => {
    if (!ENABLED) return;
    void load();
    const onChanged = () => void load();
    window.addEventListener(POSTING_PLAN_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(POSTING_PLAN_CHANGED_EVENT, onChanged);
  }, [load]);

  if (!ENABLED || !plan) return null;
  const week = plan.week ?? { done: 0, total: 0 };
  const open = plan.posts.filter((post) => post.status === 'planned');
  if (open.length === 0 && !plan.next) return null;

  const mark = async (post: TodayPost, status: 'done' | 'skipped') => {
    setBusy(post.id);
    try {
      await setPostStatus(post.artistId, post.id, status);
      captureAnalyticsEvent({ name: 'posting_plan_post_status', properties: { artist_id: post.artistId, status, source: 'home' } });
    } catch {
      setBusy(null);
      return;
    }
    setBusy(null);
  };

  const first = open[0] ?? plan.next ?? null;

  return (
    <section
      aria-labelledby="today-post-title"
      className="mt-5 rounded-[20px] border border-stroke-default bg-bg-surface px-5 py-4"
    >
      {open.map((post, index) => (
        <div key={post.id} className="border-b border-stroke-default pb-4 [&+&]:pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-content-secondary">
            Today · {post.artistName}
          </p>
          <h2 id={index === 0 ? 'today-post-title' : undefined} className="mt-1.5 break-words text-base font-semibold text-content-primary">
            Post {post.what}
          </h2>
          {post.platform ? <p className="mt-0.5 text-sm text-content-secondary">{PLATFORM_LABELS[post.platform]}</p> : null}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={busy === post.id}
              onClick={() => void mark(post, 'done')}
              className="motion-press min-h-11 rounded-full bg-content-primary text-sm font-semibold text-content-inverse disabled:opacity-50"
            >
              Done
            </button>
            <button
              type="button"
              disabled={busy === post.id}
              onClick={() => void mark(post, 'skipped')}
              className="motion-press min-h-11 rounded-full border border-stroke-default text-sm font-semibold text-content-primary disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        </div>
      ))}
      {open.length === 0 ? (
        <h2 id="today-post-title" className="text-base font-semibold text-content-primary">
          Nothing to post today
        </h2>
      ) : null}
      <dl className="mt-3 space-y-1.5 text-sm">
        {week.total > 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-content-secondary">This week</dt>
            <dd className="font-semibold text-content-primary">
              {week.done} of {week.total} posted
            </dd>
          </div>
        ) : null}
        {plan.next ? (
          <div className="flex justify-between gap-3">
            <dt className="text-content-secondary">Next</dt>
            <dd className="min-w-0 truncate text-right font-semibold text-content-primary">
              {nextDayWords(plan.next.postDay, plan.today)} · {plan.next.what}
            </dd>
          </div>
        ) : null}
      </dl>
      {first ? (
        <Link
          href={artistHref(first.artistId)}
          className="motion-focus mt-3 inline-block text-sm text-content-secondary underline underline-offset-4"
        >
          Open {first.artistName}&apos;s posting plan
        </Link>
      ) : null}
    </section>
  );
}
