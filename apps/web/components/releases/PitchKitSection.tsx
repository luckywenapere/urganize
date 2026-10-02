/* eslint-disable @next/next/no-img-element */
'use client';

import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedEstimateLine } from '@/lib/credits/copy';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ImageOff, Loader2, Plus, Sparkles, Trash2 } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { UrgansLockedSheet } from '@/components/urgans-actions/UrgansLockedSheet';
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
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary hover:border-content-secondary';
const PRIMARY_BUTTON =
  'motion-focus motion-press inline-flex h-9 items-center gap-2 border border-brand/25 bg-brand px-3.5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';
const QUIET_BUTTON =
  'motion-focus motion-press inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-elevated px-3.5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60';

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

const DRAFT_LABELS: Record<string, string> = {
  descriptor: 'One-line description',
  short: 'Short bio',
  medium: 'Medium bio',
  long: 'Long bio',
  hook: 'Hook for this rollout',
};

/**
 * The pitch kit: what this rollout adds to the artist's standing press kit.
 *
 * The artist keeps ONE press kit. A rollout adds the story behind it and the
 * credits to show. The cover is the rollout's own cover art, shown here and
 * changed in the Cover art scene. Fetches for itself and is not cached: it is
 * edited in place, and a cached copy painted over a live edit is the failure
 * the old plan scene was kept out of the cache for.
 */
export function PitchKitSection({ releaseId, onToast }: PitchKitSectionProps) {
  const [data, setData] = useState<PitchKitPayload | null>(null);
  const [loadError, setLoadError] = useState('');
  const [story, setStory] = useState('');
  const [credits, setCredits] = useState<ReleaseEpkCredit[] | null>(null);
  const [savingStory, setSavingStory] = useState(false);
  const [savingCredits, setSavingCredits] = useState(false);

  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [fillError, setFillError] = useState('');
  const [draft, setDraft] = useState<FillBothDraft | null>(null);
  const [lockedMessage, setLockedMessage] = useState('');

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
        adopt(body.pitchKit as PitchKitPayload);
        onToast('Saved.', 'success');
      } catch {
        onToast('Could not reach the server. Try again.', 'error');
      } finally {
        setSaving(false);
      }
    },
    [adopt, onToast, releaseId]
  );

  const fill = useCallback(async () => {
    setBusy(true);
    setFillError('');
    const result = await runFillBoth({ releaseId, notes });
    setBusy(false);
    if (!result.ok) {
      if (result.planRequired) {
        setLockedMessage(result.error);
        return;
      }
      setFillError(result.error);
      return;
    }
    setDraft(result.draft);
  }, [notes, releaseId]);

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
    onToast('Filled in.', 'success');
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

  if (loadError && !data) {
    return (
      <div className="mt-8 border border-status-error/30 bg-status-error/5 p-4">
        <p className="text-sm text-content-primary" role="alert">
          We could not load this rollout&apos;s pitch kit.
        </p>
        <p className="mt-1 text-xs text-content-secondary">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="motion-focus mt-3 text-xs font-semibold text-brand hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-8 space-y-4" aria-busy="true">
        <div className="h-24 animate-pulse border border-stroke-default bg-bg-surface" />
        <div className="h-48 animate-pulse border border-stroke-default bg-bg-surface" />
        <div className="h-40 animate-pulse border border-stroke-default bg-bg-surface" />
      </div>
    );
  }

  const storyDirty = story.trim() !== data.fields.story.trim();
  const automatic = credits === null;
  const shownCredits = credits ?? data.submittedCredits;
  const kit = data.kit;
  const kitHref = kit
    ? `/dashboard/press-kits/${kit.artistId}`
    : '/dashboard/press-kits';
  const draftEntries = draft
    ? (Object.entries(draft.kit).filter(([, value]) => Boolean(value)) as [string, string][])
    : [];

  return (
    <div className="mt-8 space-y-6">
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs" aria-label="What this pitch has">
        {data.checklist.map((item) => (
          <li
            key={item.key}
            className={`inline-flex items-center gap-1.5 ${
              item.done ? 'text-content-primary' : 'text-content-tertiary'
            }`}
          >
            {item.done ? (
              <Check className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
            ) : (
              <span
                className="inline-block h-3.5 w-3.5 rounded-full border border-stroke-control"
                aria-hidden="true"
              />
            )}
            {item.label}
            <span className="sr-only">{item.done ? ', done' : ', not done'}</span>
          </li>
        ))}
      </ul>

      <section className="border border-stroke-default bg-bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-content-primary">
              {data.release.artistName ? `${data.release.artistName}'s press kit` : 'The press kit'}
            </h3>
            <p className="mt-1 text-xs text-content-secondary">
              One standing kit for the artist. This rollout reads it and adds its own story and
              credits below.
            </p>
          </div>
          <Link
            href={kitHref}
            className="motion-focus shrink-0 text-xs font-semibold text-brand hover:underline"
          >
            {kit ? 'Edit the press kit' : 'Set up the press kit'}
          </Link>
        </div>
        {kit ? (
          <div className="mt-3 space-y-1.5 text-xs text-content-secondary">
            <p>
              <span className="font-semibold text-content-primary">
                {kit.publishedAt ? 'Published' : 'Not published yet'}
              </span>
              {kit.contactCount > 0
                ? ` · ${kit.contactCount} ${kit.contactCount === 1 ? 'contact' : 'contacts'}`
                : ' · no contact yet'}
            </p>
            {kit.descriptor ? <p className="text-content-primary">{kit.descriptor}</p> : null}
            {kit.shortBio ? <p className="line-clamp-3">{kit.shortBio}</p> : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-content-tertiary">
            This artist has no press kit yet. Create one and it appears here.
          </p>
        )}
      </section>

      <section className="border border-stroke-default bg-bg-surface p-4">
        <h3 className="text-sm font-semibold text-content-primary">This rollout</h3>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row">
          <div className="aspect-square w-full max-w-[120px] shrink-0 overflow-hidden rounded-lg border border-stroke-default bg-bg-elevated">
            {data.coverUrl ? (
              <img src={data.coverUrl} alt="Cover art" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-content-tertiary">
                <ImageOff className="h-5 w-5" aria-hidden="true" />
                <span className="text-[11px]">No cover art</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="pitch-kit-story" className="text-xs font-semibold text-content-primary">
              The story behind it
            </label>
            <textarea
              id="pitch-kit-story"
              value={story}
              onChange={(event) => setStory(event.target.value)}
              maxLength={MAX_STORY_LENGTH}
              rows={6}
              placeholder="Why this record exists and why it is worth a listen. A few sentences is plenty."
              className={`${FIELD_CLASS} mt-1.5 resize-y`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void save({ story }, 'story')}
                disabled={!storyDirty || savingStory}
                className={PRIMARY_BUTTON}
              >
                {savingStory ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Save story
              </button>
              {data.fields.storySource === 'ai' && !storyDirty && data.fields.story ? (
                <span className="text-xs text-content-tertiary">Written by UrgAns, accepted by you.</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-stroke-default pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-content-primary">Credits</h4>
            <p className="text-[11px] text-content-tertiary">
              {automatic
                ? 'From what collaborators sent in. Edit the list to make it your own.'
                : 'Your own list.'}
            </p>
          </div>

          {shownCredits.length === 0 ? (
            <p className="mt-2 text-xs text-content-tertiary">
              {automatic
                ? 'Nobody has sent credits yet. Add them yourself, or collect them in Metadata.'
                : 'No credits on this pitch.'}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {shownCredits.map((credit, index) => (
                <li key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`Credit ${index + 1} name`}
                    value={credit.name}
                    onChange={(event) => {
                      const next = shownCredits.map((c, i) =>
                        i === index ? { ...c, name: event.target.value } : c
                      );
                      setCredits(next);
                    }}
                    className={`${FIELD_CLASS} min-w-0 flex-1 sm:max-w-[16rem]`}
                  />
                  <input
                    aria-label={`Credit ${index + 1} role`}
                    value={credit.role}
                    placeholder="Role"
                    onChange={(event) => {
                      const next = shownCredits.map((c, i) =>
                        i === index ? { ...c, role: event.target.value } : c
                      );
                      setCredits(next);
                    }}
                    className={`${FIELD_CLASS} min-w-0 flex-1 sm:max-w-[14rem]`}
                  />
                  <button
                    type="button"
                    aria-label={`Remove credit ${index + 1}`}
                    onClick={() => setCredits(shownCredits.filter((_, i) => i !== index))}
                    className="motion-focus motion-press inline-flex h-9 w-9 items-center justify-center border border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCredits([...shownCredits, { name: '', role: '' }])}
              disabled={shownCredits.length >= MAX_CREDITS}
              className={QUIET_BUTTON}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add a credit
            </button>
            {credits !== null ? (
              <>
                <button
                  type="button"
                  onClick={() => void save({ credits }, 'credits')}
                  disabled={savingCredits}
                  className={PRIMARY_BUTTON}
                >
                  {savingCredits ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                  Save credits
                </button>
                <button
                  type="button"
                  onClick={() => void save({ credits: null }, 'credits')}
                  disabled={savingCredits}
                  className={QUIET_BUTTON}
                >
                  Use what collaborators sent
                </button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border border-stroke-default bg-bg-surface p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-content-primary">
              Let UrgAns fill in the gaps
            </h3>
            <p className="mt-1 text-xs text-content-secondary">
              UrgAns writes whatever is still empty in the press kit and in this rollout&apos;s story,
              using what is already here. It never replaces something you wrote, and nothing is
              saved until you accept it.
            </p>
          </div>
        </div>

        {draft ? (
          <div className="mt-4 space-y-3">
            {draftEntries.map(([key, value]) => (
              <div key={key}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                  {DRAFT_LABELS[key] ?? key}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-content-primary">{value}</p>
              </div>
            ))}
            {draft.story ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                  Story for this rollout
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-content-primary">{draft.story}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void accept()} disabled={busy} className={PRIMARY_BUTTON}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                Accept
              </button>
              <button type="button" onClick={() => void discard()} disabled={busy} className={QUIET_BUTTON}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label htmlFor="pitch-kit-notes" className="text-xs font-semibold text-content-primary">
              Anything it should know? <span className="font-normal text-content-tertiary">Optional</span>
            </label>
            <textarea
              id="pitch-kit-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="For example: recorded in one night in Lagos, first record with a live band."
              className={FIELD_CLASS}
            />
            <button type="button" onClick={() => void fill()} disabled={busy} className={PRIMARY_BUTTON}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {busy ? 'Writing…' : 'Fill both'}
            </button>
            {isCreditsEnabled() ? (
              <p className="mt-2 text-xs text-content-tertiary">{embeddedEstimateLine('epk.fill_both')}</p>
            ) : null}
          </div>
        )}

        {fillError ? (
          <p className="mt-3 text-xs text-status-error" role="alert">
            {fillError}
          </p>
        ) : null}
      </section>

      <UrgansLockedSheet
        open={Boolean(lockedMessage)}
        message={lockedMessage}
        actionType="epk.fill_both"
        onClose={() => setLockedMessage('')}
      />
    </div>
  );
}
