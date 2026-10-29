'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useAuthStore } from '@/lib/auth-store';
import { useChappiStore } from '@/stores/useChappiStore';
import {
  PLATFORM_LABELS,
  SHEET_PLATFORMS,
  bucketPosts,
  dayBadge,
  weekSummary,
  type ArtistPost,
  type PostPlatform,
} from '@/lib/posting-plan';
import {
  POSTING_PLAN_CHANGED_EVENT,
  addPost,
  fetchArtistPlan,
  removePost,
  setPostStatus,
  type ArtistPlan,
} from '@/lib/posting-plan-client';

// The artist's posting plan (2026-10-27, mocks docs/mocks/content-calendar-artist).
// One list per artist, this week first. Tap the circle to mark done. Four
// fields to add one: what, day, where, who posts.

type Tab = 'this' | 'next' | 'past';

const primaryButton =
  'motion-press inline-flex min-h-11 w-full items-center justify-center rounded-full bg-content-primary px-5 text-sm font-semibold text-content-inverse transition-opacity hover:opacity-90 disabled:opacity-50';
const secondaryButton =
  'motion-press inline-flex min-h-11 w-full items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-50';

function Mark({ post, onToggle }: { post: ArtistPost; onToggle: () => void }) {
  const done = post.status === 'done';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={done ? `Mark "${post.what}" not done` : `Mark "${post.what}" done`}
      className="motion-focus -m-2 grid h-11 w-11 shrink-0 place-items-center rounded-full"
    >
      <span
        className={`grid h-6 w-6 place-items-center rounded-full border-[1.5px] ${
          done ? 'border-brand bg-brand text-white' : post.status === 'skipped' ? 'border-dashed border-stroke-strong' : 'border-stroke-strong'
        }`}
      >
        {done ? (
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
            <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}

function AddPostSheet({
  plan,
  artistId,
  viewerId,
  onClose,
  onAdded,
}: {
  plan: ArtistPlan;
  artistId: string;
  viewerId: string;
  onClose: () => void;
  onAdded: (post: ArtistPost) => void;
}) {
  const [what, setWhat] = useState('');
  const [postDay, setPostDay] = useState(plan.today);
  const [platform, setPlatform] = useState<PostPlatform | null>(null);
  const [ownerUserId, setOwnerUserId] = useState(
    plan.people.some((person) => person.userId === viewerId) ? viewerId : plan.people[0]?.userId ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (!what.trim()) {
      setError('Say what to post.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const post = await addPost(artistId, { what: what.trim(), postDay, platform, ownerUserId: ownerUserId || null });
      captureAnalyticsEvent({ name: 'posting_plan_post_added', properties: { artist_id: artistId, source: 'sheet', has_platform: Boolean(platform) } });
      onAdded(post);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add the post.');
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-end justify-center bg-black/40 sm:items-center sm:px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-post-title"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-t-[20px] border border-stroke-default bg-bg-elevated px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 shadow-xl sm:rounded-2xl sm:p-6"
      >
        <h2 id="new-post-title" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-content-secondary">
          New post
        </h2>
        <label className="mt-4 block text-sm font-semibold text-content-primary" htmlFor="post-what">
          What
        </label>
        <input
          id="post-what"
          autoFocus
          value={what}
          maxLength={200}
          onChange={(event) => setWhat(event.target.value)}
          placeholder="Behind the scenes from the shoot"
          className="mt-1.5 h-12 w-full rounded-lg border border-stroke-control bg-bg-surface px-3 text-base text-content-primary placeholder:text-content-tertiary focus:border-stroke-strong focus:outline-none"
        />
        <label className="mt-4 block text-sm font-semibold text-content-primary" htmlFor="post-day">
          Day
        </label>
        <input
          id="post-day"
          type="date"
          value={postDay}
          onChange={(event) => setPostDay(event.target.value)}
          className="mt-1.5 h-12 w-full rounded-lg border border-stroke-control bg-bg-surface px-3 text-base text-content-primary focus:border-stroke-strong focus:outline-none"
        />
        <p className="mt-4 text-sm font-semibold text-content-primary">
          Where <span className="font-normal text-content-tertiary">(optional)</span>
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {SHEET_PLATFORMS.map((option) => {
            const on = platform === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                onClick={() => setPlatform(on ? null : option)}
                className={`motion-focus min-h-10 rounded-full border px-3.5 text-sm ${
                  on ? 'border-brand bg-brand/10 font-semibold text-brand' : 'border-stroke-default text-content-secondary'
                }`}
              >
                {PLATFORM_LABELS[option]}
              </button>
            );
          })}
        </div>
        {plan.people.length > 0 ? (
          <>
            <label className="mt-4 block text-sm font-semibold text-content-primary" htmlFor="post-who">
              Who posts
            </label>
            <select
              id="post-who"
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
              className="mt-1.5 h-12 w-full rounded-lg border border-stroke-control bg-bg-surface px-3 text-base text-content-primary focus:border-stroke-strong focus:outline-none"
            >
              {plan.people.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.userId === viewerId ? `${person.name} (you)` : person.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {error ? <p className="mt-3 text-sm text-status-error">{error}</p> : null}
        <div className="mt-5 space-y-2">
          <button type="button" className={primaryButton} disabled={saving} onClick={() => void save()}>
            {saving ? 'Adding…' : 'Add post'}
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function PostingPlanCard({ artistId, artistName }: { artistId: string; artistName: string }) {
  const router = useRouter();
  const viewerId = useAuthStore((state) => state.user?.id ?? '');
  const setInput = useChappiStore((state) => state.setInput);
  const setRailOpen = useChappiStore((state) => state.setRailOpen);
  const [plan, setPlan] = useState<ArtistPlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('this');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlan(await fetchArtistPlan(artistId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [artistId]);

  useEffect(() => {
    void load();
    const onChanged = () => void load();
    window.addEventListener(POSTING_PLAN_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(POSTING_PLAN_CHANGED_EVENT, onChanged);
  }, [load]);

  const buckets = useMemo(() => (plan ? bucketPosts(plan.posts, plan.today) : null), [plan]);
  const summary = useMemo(() => (plan ? weekSummary(plan.posts, plan.today) : null), [plan]);
  const nameOf = useMemo(() => new Map((plan?.people ?? []).map((person) => [person.userId, person.name])), [plan]);

  const replace = (next: ArtistPost) =>
    setPlan((current) => (current ? { ...current, posts: current.posts.map((p) => (p.id === next.id ? next : p)) } : current));

  const toggle = async (post: ArtistPost) => {
    const status = post.status === 'done' ? 'planned' : 'done';
    replace({ ...post, status });
    try {
      replace(await setPostStatus(artistId, post.id, status));
      captureAnalyticsEvent({ name: 'posting_plan_post_status', properties: { artist_id: artistId, status, source: 'artist_page' } });
    } catch {
      replace(post);
    }
  };

  const remove = async (post: ArtistPost) => {
    setPlan((current) => (current ? { ...current, posts: current.posts.filter((p) => p.id !== post.id) } : current));
    try {
      await removePost(artistId, post.id);
    } catch {
      void load();
    }
  };

  const planWithUrgans = () => {
    captureAnalyticsEvent({ name: 'posting_plan_ask_urgans', properties: { artist_id: artistId } });
    setInput(`Plan posts for ${artistName} this week: `);
    if (window.matchMedia('(min-width: 1024px)').matches) setRailOpen(true);
    else router.push('/dashboard/urgans');
  };

  const list = !buckets ? [] : tab === 'this' ? buckets.thisWeek : tab === 'next' ? [...buckets.nextWeek, ...buckets.later] : buckets.past;
  const empty = {
    this: 'Nothing planned this week.',
    next: 'Nothing planned after this week.',
    past: 'No past posts yet.',
  }[tab];

  return (
    <section className="rounded-2xl bg-bg-surface p-4" aria-labelledby="posting-plan-title">
      <h2 id="posting-plan-title" className="font-display text-base font-semibold text-content-primary">
        Posting plan
      </h2>
      <p className="mt-0.5 text-sm text-content-secondary">
        {summary && summary.total > 0
          ? `${summary.total} post${summary.total === 1 ? '' : 's'} this week. ${summary.done} of ${summary.total} done.`
          : `Keep ${artistName} in people's feeds between releases.`}
      </p>

      <div role="tablist" aria-label="Weeks" className="mt-3 flex gap-5 border-b border-stroke-default">
        {(
          [
            ['this', 'This week'],
            ['next', 'Next week'],
            ['past', 'Past'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`motion-focus -mb-px min-h-10 border-b-2 text-sm ${
              tab === key ? 'border-content-primary font-semibold text-content-primary' : 'border-transparent text-content-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {failed ? (
        <p className="mt-3 text-sm text-content-secondary">The posting plan didn&apos;t load.</p>
      ) : !plan ? (
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-bg-elevated" aria-busy="true" />
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-content-tertiary">{empty}</p>
      ) : (
        <ul className="mt-1">
          {list.map((post) => {
            const badge = dayBadge(post.postDay, plan.today);
            const isToday = post.postDay === plan.today;
            const who = post.ownerUserId ? nameOf.get(post.ownerUserId) : null;
            const meta = [post.platform ? PLATFORM_LABELS[post.platform] : null, who, post.status === 'skipped' ? 'Skipped' : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <li
                key={post.id}
                className={`flex items-start gap-3 border-t border-stroke-default py-3 first:border-t-0 ${
                  isToday ? '-mx-4 bg-brand/5 px-4' : ''
                }`}
              >
                <div className="w-11 shrink-0 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-content-secondary">{badge.label}</p>
                  <p className="text-lg font-bold leading-tight text-content-primary">{badge.date}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`break-words text-[15px] font-semibold ${
                      post.status === 'done' ? 'text-content-tertiary line-through' : 'text-content-primary'
                    }`}
                  >
                    {post.what}
                  </p>
                  {meta ? <p className="mt-0.5 text-[13px] text-content-secondary">{meta}</p> : null}
                  <button
                    type="button"
                    onClick={() => void remove(post)}
                    className="motion-focus mt-1 text-xs text-content-tertiary underline-offset-2 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <Mark post={post} onToggle={() => void toggle(post)} />
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 space-y-2">
        <button type="button" className={primaryButton} onClick={planWithUrgans}>
          Plan posts with UrgAns
        </button>
        <button type="button" className={secondaryButton} disabled={!plan} onClick={() => setAdding(true)}>
          Add a post
        </button>
      </div>

      {adding && plan ? (
        <AddPostSheet
          plan={plan}
          artistId={artistId}
          viewerId={viewerId}
          onClose={() => setAdding(false)}
          onAdded={(post) => {
            setPlan((current) => (current ? { ...current, posts: [...current.posts, post] } : current));
            setAdding(false);
          }}
        />
      ) : null}
    </section>
  );
}
