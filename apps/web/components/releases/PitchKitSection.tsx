/* eslint-disable @next/next/no-img-element */
'use client';

import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedCostLine } from '@/lib/credits/copy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  ImageOff,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { UrgansLockedSheet } from '@/components/urgans-actions/UrgansLockedSheet';
import { useCreditBalance } from '@/components/urgans-actions/useCreditBalance';
import {
  applyRunAction,
  discardRunAction,
  runFillBoth,
  type FillBothDraft,
} from '@/lib/urgans-actions/client';
import {
  MAX_CREDITS,
  MAX_STORY_LENGTH,
  type ReleaseEpkCredit,
  type ReleaseEpkFields,
} from '@/lib/release-epk';
import type { PitchKitPayload } from '@/lib/release-epk-server';

type PitchKitSectionProps = {
  releaseId: string;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

const FIELD_CLASS =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2.5 text-sm text-content-primary placeholder:text-content-tertiary hover:border-content-secondary focus:border-brand focus:outline-none';
const PRIMARY_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';
const QUIET_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60';

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

const DRAFT_LABELS: Record<string, string> = {
  descriptor: 'About the artist, in one line',
  short: 'Short bio',
  medium: 'Medium bio',
  long: 'Long bio',
  hook: 'Why this song',
};

const sameCredits = (a: ReleaseEpkCredit[], b: ReleaseEpkCredit[]): boolean =>
  JSON.stringify(a.map((c) => [c.name.trim(), c.role.trim()])) ===
  JSON.stringify(b.map((c) => [c.name.trim(), c.role.trim()]));

/** One numbered step. The number turns into a check when the step is done. */
function Step({
  index,
  done,
  title,
  hint,
  children,
}: {
  index: number;
  done: boolean;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-4">
      <span
        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
          done
            ? 'bg-brand text-content-inverse'
            : 'border-2 border-stroke-control text-content-secondary'
        }`}
        aria-hidden="true"
      >
        {done ? <Check className="h-4 w-4" /> : index}
      </span>
      <div className="min-w-0 flex-1 pb-8">
        <h3 className="font-display text-base font-semibold text-content-primary">
          {title}
          <span className="sr-only">{done ? ', done' : ', not done yet'}</span>
        </h3>
        <p className="mt-0.5 text-sm text-content-secondary">{hint}</p>
        <div className="mt-3">{children}</div>
      </div>
    </li>
  );
}

/**
 * The pitch kit for one rollout: three steps a fifth grader can follow.
 *
 * Redesigned 2026-10-11 (founder brief: "look at it from the point of a fifth
 * grader that wants to derive value from that tool. It is too overwhelming").
 * What changed, and why:
 *
 * - One big "Write it for me" at the top instead of an AI box at the bottom.
 *   The fastest path to a finished kit is the first thing on the screen.
 * - Three numbered steps (story, who made it, share) replace a checklist row,
 *   three bordered cards and paragraphs of explanation. The number becomes a
 *   check when the step is done, so the progress IS the layout.
 * - No Save buttons. The story and the credits save when you click away, the
 *   same autosave the press kit editor already uses.
 * - The artist press kit is no longer a card of statuses. It is step three,
 *   "Share it", and it says exactly one thing to do next.
 *
 * Data, routes and the UrgAns action are unchanged. Fetches for itself and is
 * not cached: it is edited in place, and a cached copy painted over a live edit
 * is the failure the old plan scene was kept out of the cache for.
 */
export function PitchKitSection({ releaseId, onToast }: PitchKitSectionProps) {
  const [data, setData] = useState<PitchKitPayload | null>(null);
  const [loadError, setLoadError] = useState('');
  const [story, setStory] = useState('');
  const [credits, setCredits] = useState<ReleaseEpkCredit[] | null>(null);
  const [savingStory, setSavingStory] = useState(false);
  const [savingCredits, setSavingCredits] = useState(false);
  const [savedAt, setSavedAt] = useState<'story' | 'credits' | null>(null);

  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fillError, setFillError] = useState('');
  const { balance, refresh: refreshBalance } = useCreditBalance();
  const [draft, setDraft] = useState<FillBothDraft | null>(null);
  const [lockedMessage, setLockedMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const savedTimer = useRef<number | null>(null);

  const adopt = useCallback((pitchKit: PitchKitPayload) => {
    setData(pitchKit);
    setStory(pitchKit.fields.story);
    setCredits(pitchKit.fields.credits);
  }, []);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const headers = await authHeaders();
      if (!headers) {
        setLoadError('Your session expired. Sign in again.');
        return;
      }
      const response = await fetch(`/api/releases/${releaseId}/pitch-kit`, { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoadError(String(body?.error || 'Could not load the pitch kit.'));
        return;
      }
      adopt(body.pitchKit as PitchKitPayload);
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    }
  }, [adopt, releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    },
    []
  );

  const save = useCallback(
    async (patch: Partial<ReleaseEpkFields>, which: 'story' | 'credits') => {
      const headers = await authHeaders();
      if (!headers) {
        onToast('Your session expired. Sign in again.', 'error');
        return;
      }
      const setSaving = which === 'story' ? setSavingStory : setSavingCredits;
      setSaving(true);
      try {
        const response = await fetch(`/api/releases/${releaseId}/pitch-kit`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(patch),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          onToast(String(body?.error || 'Could not save that.'), 'error');
          return;
        }
        // Keep what is in the boxes: the person may have typed on while the
        // save was in flight. Only the server's view (data) is replaced.
        const next = body.pitchKit as PitchKitPayload;
        setData(next);
        if (which === 'credits') setCredits(next.fields.credits);
        setSavedAt(which);
        if (savedTimer.current) window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSavedAt(null), 2000);
      } catch {
        onToast('Could not reach the server. Try again.', 'error');
      } finally {
        setSaving(false);
      }
    },
    [onToast, releaseId]
  );

  const fill = useCallback(async () => {
    setBusy(true);
    setFillError('');
    const result = await runFillBoth({ releaseId, notes });
    setBusy(false);
    // The run just settled, so the balance has moved (a failed run costs nothing).
    void refreshBalance();
    if (!result.ok) {
      if (result.planRequired) {
        setLockedMessage(result.error);
        return;
      }
      setFillError(result.error);
      return;
    }
    setDraft(result.draft);
  }, [notes, releaseId, refreshBalance]);

  const accept = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    setFillError('');
    const headers = await authHeaders();
    const token = headers ? headers.Authorization.replace('Bearer ', '') : '';
    const result = await applyRunAction(draft.actionId, token);
    setBusy(false);
    if (!result.ok) {
      setFillError(result.error);
      return;
    }
    setDraft(null);
    setNotes('');
    setShowNotes(false);
    onToast('Added to your kit.', 'success');
    await load();
  }, [draft, load, onToast]);

  const discard = useCallback(async () => {
    if (!draft) return;
    const current = draft;
    setDraft(null);
    setFillError('');
    const headers = await authHeaders();
    const token = headers ? headers.Authorization.replace('Bearer ', '') : '';
    // Fire and forget: nothing was written, so a failed discard costs a stale
    // log line and not the person's time.
    void discardRunAction(current.actionId, token);
  }, [draft]);

  const publicUrl = useMemo(() => {
    if (!data?.kit?.slug) return '';
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return `${origin}/k/${data.kit.slug}`;
  }, [data?.kit?.slug]);

  if (loadError && !data) {
    return (
      <div className="mt-8 rounded-xl border border-status-error/30 bg-status-error/5 p-4">
        <p className="text-sm text-content-primary" role="alert">
          We could not open this pitch kit.
        </p>
        <p className="mt-1 text-xs text-content-secondary">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="motion-focus mt-3 text-sm font-semibold text-brand hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-8 space-y-4" aria-busy="true">
        <div className="h-32 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
        <div className="h-48 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
      </div>
    );
  }

  const automatic = credits === null;
  const shownCredits = credits ?? data.submittedCredits;
  const kit = data.kit;
  const kitHref = kit ? `/dashboard/press-kits/${kit.artistId}` : '/dashboard/press-kits';
  const draftEntries = draft
    ? (Object.entries(draft.kit).filter(([, value]) => Boolean(value)) as [string, string][])
    : [];

  const storyDone = data.fields.story.trim().length > 0;
  const creditsDone = data.credits.length > 0;
  const shareDone = Boolean(kit?.publishedAt);
  const doneCount = [storyDone, creditsDone, shareDone].filter(Boolean).length;
  const allDone = doneCount === 3;

  const saveStoryIfChanged = () => {
    if (story.trim() !== data.fields.story.trim()) void save({ story }, 'story');
  };
  const saveCreditsIfChanged = (next: ReleaseEpkCredit[]) => {
    const kept = next.filter((c) => c.name.trim() || c.role.trim());
    const baseline = data.fields.credits ?? data.submittedCredits;
    if (!sameCredits(kept, baseline)) void save({ credits: kept }, 'credits');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('Could not copy. Open the kit and copy the address.', 'error');
    }
  };

  const savedNote = (which: 'story' | 'credits', saving: boolean) =>
    saving ? (
      <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Saving
      </span>
    ) : savedAt === which ? (
      <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
        <Check className="h-3 w-3 text-brand" aria-hidden="true" />
        Saved
      </span>
    ) : null;

  return (
    <div className="mt-6 space-y-6">
      {/* The hero: the cover, what this is for in one line, how far along it
          is, and the fastest way to finish. */}
      <section className="rounded-2xl border border-stroke-default bg-bg-surface p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="aspect-square w-20 shrink-0 overflow-hidden rounded-xl border border-stroke-default bg-bg-elevated sm:w-24">
            {data.coverUrl ? (
              <img src={data.coverUrl} alt="Cover art" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-content-tertiary">
                <ImageOff className="h-5 w-5" aria-hidden="true" />
                <span className="text-[10px]">No cover yet</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold text-content-primary">
              {allDone ? 'Your pitch kit is ready' : 'Your pitch kit'}
            </h2>
            <p className="mt-1 text-sm text-content-secondary">
              {allDone
                ? 'Send the link to playlists, blogs and radio.'
                : 'Everything a playlist or a blog needs to say yes to this song.'}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-bg-elevated"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={doneCount}
                aria-label="Steps done"
              >
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-500"
                  style={{ width: `${(doneCount / 3) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-semibold text-content-secondary">
                {doneCount} of 3
              </span>
            </div>
          </div>
        </div>

        {draft ? (
          <div className="mt-5 rounded-xl border border-brand/30 bg-brand/5 p-4">
            <p className="text-sm font-semibold text-content-primary">Here is what we wrote</p>
            <p className="mt-0.5 text-xs text-content-secondary">
              It only fills empty spots. Nothing you wrote is changed.
            </p>
            <div className="mt-4 space-y-4">
              {draft.story ? (
                <div>
                  <p className="text-xs font-semibold text-content-tertiary">The story</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-content-primary">{draft.story}</p>
                </div>
              ) : null}
              {draftEntries.map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs font-semibold text-content-tertiary">
                    {DRAFT_LABELS[key] ?? key}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-content-primary">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void accept()} disabled={busy} className={PRIMARY_BUTTON}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                Use it
              </button>
              <button type="button" onClick={() => void discard()} disabled={busy} className={QUIET_BUTTON}>
                No thanks
              </button>
            </div>
          </div>
        ) : !allDone ? (
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void fill()} disabled={busy} className={PRIMARY_BUTTON}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                {busy ? 'Writing…' : 'Write it for me'}
              </button>
              {!showNotes ? (
                <button
                  type="button"
                  onClick={() => setShowNotes(true)}
                  className="motion-focus text-sm font-semibold text-content-secondary hover:text-content-primary"
                >
                  Give it a hint
                </button>
              ) : null}
            </div>
            {showNotes ? (
              <textarea
                aria-label="A hint for UrgAns"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                maxLength={2000}
                autoFocus
                placeholder="Like: we made it in one night in Lagos."
                className={`${FIELD_CLASS} mt-3`}
              />
            ) : null}
            {isCreditsEnabled() ? (
              <p className="mt-2 text-xs text-content-tertiary">
                {embeddedCostLine('epk.fill_both', balance)}
              </p>
            ) : null}
          </div>
        ) : null}

        {fillError ? (
          <p className="mt-3 text-sm text-status-error" role="alert">
            {fillError}
          </p>
        ) : null}
      </section>

      <ol className="px-1" aria-label="Pitch kit steps">
        <Step
          index={1}
          done={storyDone}
          title="Tell the story"
          hint="How did this song happen? Why should people listen?"
        >
          <textarea
            id="pitch-kit-story"
            aria-label="The story behind this song"
            value={story}
            onChange={(event) => setStory(event.target.value)}
            onBlur={saveStoryIfChanged}
            maxLength={MAX_STORY_LENGTH}
            rows={5}
            placeholder="A few sentences is plenty."
            className={`${FIELD_CLASS} resize-y`}
          />
          <div className="mt-1.5 flex min-h-[1.25rem] items-center gap-3">
            {savedNote('story', savingStory)}
            {!savingStory && savedAt !== 'story' && data.fields.storySource === 'ai' && data.fields.story ? (
              <span className="text-xs text-content-tertiary">Written by UrgAns. Change anything.</span>
            ) : null}
          </div>
        </Step>

        <Step
          index={2}
          done={creditsDone}
          title="Who made it"
          hint={
            automatic && data.submittedCredits.length > 0
              ? 'We added the people your team sent. Fix anything that looks wrong.'
              : 'Add who wrote it, made the beat and sang on it.'
          }
        >
          {shownCredits.length > 0 ? (
            <ul className="space-y-2">
              {shownCredits.map((credit, index) => (
                <li key={index} className="flex items-center gap-2">
                  <input
                    aria-label={`Person ${index + 1} name`}
                    value={credit.name}
                    placeholder="Name"
                    onChange={(event) =>
                      setCredits(
                        shownCredits.map((c, i) => (i === index ? { ...c, name: event.target.value } : c))
                      )
                    }
                    onBlur={() => saveCreditsIfChanged(shownCredits)}
                    className={`${FIELD_CLASS} min-w-0 flex-1`}
                  />
                  <input
                    aria-label={`Person ${index + 1} role`}
                    value={credit.role}
                    placeholder="What they did"
                    onChange={(event) =>
                      setCredits(
                        shownCredits.map((c, i) => (i === index ? { ...c, role: event.target.value } : c))
                      )
                    }
                    onBlur={() => saveCreditsIfChanged(shownCredits)}
                    className={`${FIELD_CLASS} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    aria-label={`Remove person ${index + 1}`}
                    onClick={() => {
                      const next = shownCredits.filter((_, i) => i !== index);
                      setCredits(next);
                      saveCreditsIfChanged(next);
                    }}
                    className="motion-focus motion-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setCredits([...shownCredits, { name: '', role: '' }])}
              disabled={shownCredits.length >= MAX_CREDITS}
              className="motion-focus inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline disabled:opacity-60"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a person
            </button>
            {!automatic && data.submittedCredits.length > 0 ? (
              <button
                type="button"
                onClick={() => void save({ credits: null }, 'credits')}
                disabled={savingCredits}
                className="motion-focus text-xs text-content-tertiary hover:text-content-primary"
              >
                Use what my team sent
              </button>
            ) : null}
            {savedNote('credits', savingCredits)}
          </div>
        </Step>

        <Step
          index={3}
          done={shareDone}
          title="Share it"
          hint={
            shareDone
              ? 'The artist press kit is live. This is the link to send.'
              : kit
                ? 'Finish the artist press kit and turn on its link.'
                : 'Make the artist press kit. We fill most of it in for you.'
          }
        >
          {shareDone && publicUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void copyLink()} className={PRIMARY_BUTTON}>
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" className={QUIET_BUTTON}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                See it
              </a>
              <Link href={kitHref} className="motion-focus px-1 text-sm font-semibold text-content-secondary hover:text-content-primary">
                Edit
              </Link>
            </div>
          ) : (
            <Link href={kitHref} className={kit ? QUIET_BUTTON : PRIMARY_BUTTON}>
              {kit ? 'Open the press kit' : 'Make the press kit'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          {data.kitFrozenAt ? (
            <p className="mt-2 text-xs text-content-tertiary">
              This rollout is out, so it keeps the kit as it was on that day.
            </p>
          ) : null}
        </Step>
      </ol>

      <UrgansLockedSheet
        open={Boolean(lockedMessage)}
        message={lockedMessage}
        actionType="epk.fill_both"
        onClose={() => setLockedMessage('')}
      />
    </div>
  );
}
