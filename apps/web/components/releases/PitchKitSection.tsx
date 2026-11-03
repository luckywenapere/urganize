/* eslint-disable @next/next/no-img-element */
'use client';

import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedEstimateCredits } from '@/lib/credits/embedded';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  Loader2,
  Plus,
  Trash2,
} from '@/components/icons';
import { absoluteKitUrl, publishReleaseKitLink } from '@/lib/pitch-kit-client';
import { kitLinkPath } from '@/lib/press-kit-public';
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

/** What the rest of Pitch this! needs to know about the kit: the link to
 *  attach to a pitch once it is live, and whether it is ready to share. */
export type KitShareState = { url: string | null; ready: boolean; story: string };

type PitchKitSectionProps = {
  releaseId: string;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
  onShareStateChange?: (state: KitShareState) => void;
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

/** One row of the kit: a check, a name, one line of what is there, and the
 *  editor under it while it is open. */
function KitRow({
  done,
  title,
  value,
  open,
  onToggle,
  children,
}: {
  done: boolean;
  title: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className="border-b border-stroke-subtle last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="motion-focus flex min-h-14 w-full items-center gap-3 py-3 text-left"
      >
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
            done ? 'bg-brand text-content-inverse' : 'border-[1.5px] border-content-tertiary/50'
          }`}
          aria-hidden="true"
        >
          {done ? <Check className="h-3 w-3" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-content-primary">
            {title}
            <span className="sr-only">{done ? ' (done)' : ' (not done yet)'}</span>
          </span>
          <span className="block truncate text-[13px] text-content-primary/55">{value}</span>
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open ? <div className="pb-4 pl-8">{children}</div> : null}
    </li>
  );
}

/**
 * The kit block at the top of a rollout's Pitch this! scene.
 *
 * 2026-10-16 (founder approved mocks, "Pitch this! as one place"): the
 * rollout pitch kit and the artist press kit are ONE kit with ONE link. The
 * release story and who made it sit on top; the artist basics (bio, photos,
 * contact) come from the artist kit automatically. What changed from the
 * 2026-10-11 three-step version, and why:
 *
 * - Three rows (The story, Who made it, About the artist) instead of three
 *   numbered steps. Each opens in place; nothing leaves the rollout.
 * - Step three used to send people out to the press kit editor to publish, and
 *   no outside manager ever came back with a link. Now the one accent button
 *   becomes "Copy kit link" as soon as the story is in, and copying publishes
 *   the kit (making it first when there is none).
 * - Still one accent action, still no Save buttons (autosave on blur), still
 *   "Write it for me" first. The fifth-grader wins of 2026-10-11 stay.
 *
 * 2026-10-17 (founder: "so confusing to me and the users"; approved mocks in
 * the strategy project's kit-mocks): renamed to "What curators read", the
 * rows come first with "N of 3 done", one quiet action "Write the missing
 * parts" with its cost under it, the hint moved to "Try again with a hint" on
 * the draft, the "Live at…" status line is gone (it read as live while the
 * story was empty), and once all three rows are done the block shrinks to one
 * "Ready" row plus "Copy share link".
 *
 * Fetches for itself and is not cached: it is edited in place.
 */
export function PitchKitSection({ releaseId, onToast, onShareStateChange }: PitchKitSectionProps) {
  const [data, setData] = useState<PitchKitPayload | null>(null);
  const [loadError, setLoadError] = useState('');
  const [story, setStory] = useState('');
  const [credits, setCredits] = useState<ReleaseEpkCredit[] | null>(null);
  const [savingStory, setSavingStory] = useState(false);
  const [savingCredits, setSavingCredits] = useState(false);
  const [savedAt, setSavedAt] = useState<'story' | 'credits' | 'artist' | null>(null);
  const [bio, setBio] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [savingArtist, setSavingArtist] = useState(false);
  const [artistError, setArtistError] = useState('');
  const [openRow, setOpenRow] = useState<'story' | 'credits' | 'artist' | null>(null);

  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showRows, setShowRows] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [fillError, setFillError] = useState('');
  const { balance, refresh: refreshBalance } = useCreditBalance();
  const [draft, setDraft] = useState<FillBothDraft | null>(null);
  const [lockedMessage, setLockedMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [manualLink, setManualLink] = useState('');
  const savedTimer = useRef<number | null>(null);

  const adopt = useCallback((pitchKit: PitchKitPayload) => {
    setData(pitchKit);
    setStory(pitchKit.fields.story);
    setCredits(pitchKit.fields.credits);
    setBio(pitchKit.kit?.shortBio ?? '');
    setContactEmail(pitchKit.kit?.contactEmail ?? '');
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
        setLoadError(String(body?.error || 'Check your connection.'));
        return;
      }
      adopt(body.pitchKit as PitchKitPayload);
    } catch {
      setLoadError('Check your connection.');
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

  const liveUrl = useMemo(() => {
    if (!data?.kit?.slug || !data.kit.publishedAt) return null;
    return absoluteKitUrl(kitLinkPath(data.kit.slug, releaseId));
  }, [data?.kit?.slug, data?.kit?.publishedAt, releaseId]);
  const savedStory = data?.fields.story.trim() ?? '';

  useEffect(() => {
    if (!data) return;
    onShareStateChange?.({ url: liveUrl, ready: Boolean(savedStory), story: savedStory });
  }, [data, liveUrl, savedStory, onShareStateChange]);

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

  // The About row writes to the artist's standing kit (bio + who to write to),
  // making it on the first edit. Keeps whatever is typed in the other box.
  const saveArtist = useCallback(
    async (patch: { shortBio?: string; contactEmail?: string }) => {
      const headers = await authHeaders();
      if (!headers) {
        onToast('Your session expired. Sign in again.', 'error');
        return;
      }
      setSavingArtist(true);
      setArtistError('');
      try {
        const response = await fetch(`/api/releases/${releaseId}/pitch-kit/artist`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(patch),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setArtistError(String(body?.error || 'Could not save that.'));
          return;
        }
        const next = body.pitchKit as PitchKitPayload;
        setData(next);
        // A kit made on this save may have autofilled the bio: show it only
        // when the box is still empty.
        if (patch.shortBio === undefined) setBio((current) => current || next.kit?.shortBio || '');
        setSavedAt('artist');
        if (savedTimer.current) window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSavedAt(null), 2000);
      } catch {
        setArtistError('Could not reach the server. Try again.');
      } finally {
        setSavingArtist(false);
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

  if (loadError && !data) {
    return (
      <div className="rounded-2xl border border-status-error/30 bg-status-error/5 p-4">
        <p className="text-sm font-semibold text-content-primary" role="alert">
          Couldn’t open your kit.
        </p>
        <p className="mt-1 text-[13px] text-content-primary/55">{loadError}</p>
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
      <div className="rounded-2xl bg-bg-surface p-4 sm:p-5" aria-busy="true" aria-label="Loading your kit">
        <div className="flex items-center gap-4">
          <div className="h-[68px] w-[68px] shrink-0 animate-pulse rounded-xl bg-bg-elevated" />
          <div className="flex-1 space-y-2.5">
            <div className="h-5 w-3/5 animate-pulse rounded-md bg-bg-elevated" />
            <div className="h-3 w-1/3 animate-pulse rounded-md bg-bg-elevated" />
          </div>
        </div>
        <div className="mt-4 h-11 w-40 animate-pulse rounded-xl bg-bg-elevated" />
        <div className="mt-6 space-y-5">
          <div className="h-3.5 w-full animate-pulse rounded-md bg-bg-elevated" />
          <div className="h-3.5 w-4/5 animate-pulse rounded-md bg-bg-elevated" />
          <div className="h-3.5 w-2/3 animate-pulse rounded-md bg-bg-elevated" />
        </div>
      </div>
    );
  }

  const automatic = credits === null;
  const shownCredits = credits ?? data.submittedCredits;
  const kit = data.kit;
  const artistName = data.release.artistName || 'the artist';
  const draftEntries = draft
    ? (Object.entries(draft.kit).filter(([, value]) => Boolean(value)) as [string, string][])
    : [];

  const storyDone = data.fields.story.trim().length > 0;
  const creditsDone = data.credits.length > 0;
  const kitBio = kit ? kit.shortBio.trim() : '';
  const kitEmail = kit?.contactEmail?.trim() ?? '';
  const artistDone = Boolean(kitBio) && Boolean(kitEmail);
  const frozen = Boolean(data.kitFrozenAt);

  const saveStoryIfChanged = () => {
    if (story.trim() !== data.fields.story.trim()) void save({ story }, 'story');
  };
  const saveCreditsIfChanged = (next: ReleaseEpkCredit[]) => {
    const kept = next.filter((c) => c.name.trim() || c.role.trim());
    const baseline = data.fields.credits ?? data.submittedCredits;
    if (!sameCredits(kept, baseline)) void save({ credits: kept }, 'credits');
  };

  const copyText = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setManualLink('');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A browser that drops the copy after the publish round trip still gets
      // the link, shown where it can be selected by hand.
      setManualLink(url);
    }
  };

  const shareKit = async () => {
    if (liveUrl) {
      await copyText(liveUrl);
      return;
    }
    setSharing(true);
    const result = await publishReleaseKitLink(releaseId);
    setSharing(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      if (result.code === 'no_contact') {
        setOpenRow('artist');
        window.setTimeout(() => document.getElementById('pitch-kit-contact')?.focus(), 50);
      }
      return;
    }
    await copyText(result.url);
    onToast('Link copied.', 'success');
    void load();
  };

  const savedNote = (which: 'story' | 'credits' | 'artist', saving: boolean) =>
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

  const storyValue = data.fields.story.trim() || 'Not written yet';
  const creditsValue = creditsDone
    ? `${data.credits.length} ${data.credits.length === 1 ? 'person' : 'people'}${
        automatic && data.submittedCredits.length > 0 ? ' · from your team' : ''
      }`
    : 'Not added yet';
  const artistParts = [kitBio ? 'Bio' : '', kitEmail ? 'contact' : ''].filter(Boolean);
  const artistValue = artistParts.length > 0 ? artistParts.join(' · ') : 'Add a bio and who to write to';

  const doneCount = [storyDone, creditsDone, artistDone].filter(Boolean).length;
  const ready = storyDone && creditsDone && artistDone;
  // "Write the missing parts" fills the story and the artist bio; who made it
  // stays a person's job, so it alone never shows the button.
  const missingWritable = !frozen && (!storyDone || !kitBio);
  const estimate = embeddedEstimateCredits('epk.fill_both');
  const writeCostLine =
    balance === null || !Number.isFinite(balance)
      ? `${estimate} credits`
      : `${estimate} credits · you have ${Math.max(0, Math.floor(balance)).toLocaleString('en-US')}`;
  const shareRow = storyDone ? (
    <li>
      <button
        type="button"
        onClick={() => void shareKit()}
        disabled={sharing}
        className="motion-focus flex min-h-12 w-full items-center gap-3 py-3 text-left disabled:opacity-60"
      >
        <span className="min-w-0 flex-1 text-sm font-semibold text-brand">
          {copied ? 'Copied' : 'Copy share link'}
        </span>
        {sharing ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" aria-hidden="true" />
        ) : copied ? (
          <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        )}
      </button>
      {manualLink ? (
        <input
          readOnly
          aria-label="Share link"
          value={manualLink}
          onFocus={(event) => event.currentTarget.select()}
          className={`${FIELD_CLASS} mb-3 font-mono text-xs`}
        />
      ) : null}
    </li>
  ) : null;

  return (
    <section aria-label="What curators read">
      <h3 className="font-display text-xl text-content-primary">What curators read</h3>
      <p className="mt-1 text-[13px] text-content-primary/55">
        Goes with every pitch.{ready ? '' : ` ${doneCount} of 3 done.`}
      </p>

      <div className="mt-3">
        {ready && !showRows ? (
          <ul className="rounded-2xl bg-bg-surface px-4" aria-label="What is in the kit">
            <li className="border-b border-stroke-subtle">
              <button
                type="button"
                aria-expanded={false}
                onClick={() => setShowRows(true)}
                className="motion-focus flex min-h-16 w-full items-center gap-3 py-3 text-left"
              >
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-bg-elevated">
                  {data.coverUrl ? <img src={data.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-content-primary">Ready</span>
                  <span className="block truncate text-[13px] text-content-primary/55">Story, credits, bio</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
              </button>
            </li>
            {shareRow}
          </ul>
        ) : (
          <ul className="rounded-2xl bg-bg-surface px-4" aria-label="What is in the kit">
            <KitRow
              done={storyDone}
              title="The story"
              value={storyValue}
              open={openRow === 'story'}
              onToggle={() => setOpenRow(openRow === 'story' ? null : 'story')}
            >
              <textarea
                id="pitch-kit-story"
                aria-label="The story behind this song"
                value={story}
                onChange={(event) => setStory(event.target.value)}
                onBlur={saveStoryIfChanged}
                maxLength={MAX_STORY_LENGTH}
                rows={5}
                autoFocus
                placeholder="How did this song happen? A few sentences is plenty."
                className={`${FIELD_CLASS} resize-y`}
              />
              <div className="mt-1.5 flex items-center gap-3 empty:hidden">
                {savedNote('story', savingStory)}
                {!savingStory && savedAt !== 'story' && data.fields.storySource === 'ai' && data.fields.story ? (
                  <span className="text-xs text-content-tertiary">Written by AI. Change anything.</span>
                ) : null}
              </div>
            </KitRow>

            <KitRow
              done={creditsDone}
              title="Who made it"
              value={creditsValue}
              open={openRow === 'credits'}
              onToggle={() => setOpenRow(openRow === 'credits' ? null : 'credits')}
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
                          setCredits(shownCredits.map((c, i) => (i === index ? { ...c, name: event.target.value } : c)))
                        }
                        onBlur={() => saveCreditsIfChanged(shownCredits)}
                        className={`${FIELD_CLASS} min-w-0 flex-1`}
                      />
                      <input
                        aria-label={`Person ${index + 1} role`}
                        value={credit.role}
                        placeholder="What they did"
                        onChange={(event) =>
                          setCredits(shownCredits.map((c, i) => (i === index ? { ...c, role: event.target.value } : c)))
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
                  className="motion-focus inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline disabled:opacity-60"
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
            </KitRow>

            <KitRow
              done={artistDone}
              title={`About ${artistName}`}
              value={artistValue}
              open={openRow === 'artist'}
              onToggle={() => setOpenRow(openRow === 'artist' ? null : 'artist')}
            >
              {frozen ? (
                <>
                  {kitBio ? (
                    <p className="line-clamp-4 whitespace-pre-wrap text-sm text-content-primary">{kitBio}</p>
                  ) : null}
                  {kitEmail ? <p className="mt-1 text-sm text-content-primary">{kitEmail}</p> : null}
                  <p className="mt-1 text-xs text-content-tertiary">
                    This rollout is out, so it keeps the kit as it was that day.
                  </p>
                </>
              ) : (
                <>
                  <label htmlFor="pitch-kit-bio" className="block text-[13px] font-semibold text-content-primary/55">
                    Short bio
                  </label>
                  <textarea
                    id="pitch-kit-bio"
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    onBlur={() => {
                      if (bio.trim() !== kitBio) void saveArtist({ shortBio: bio.trim() });
                    }}
                    maxLength={1000}
                    rows={3}
                    placeholder={`A line or two about ${artistName}.`}
                    className={`${FIELD_CLASS} mt-1.5 resize-y`}
                  />
                  <label
                    htmlFor="pitch-kit-contact"
                    className="mt-4 block text-[13px] font-semibold text-content-primary/55"
                  >
                    Who to write to
                  </label>
                  <input
                    id="pitch-kit-contact"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    onBlur={() => {
                      if (contactEmail.trim() !== kitEmail) void saveArtist({ contactEmail: contactEmail.trim() });
                    }}
                    maxLength={254}
                    placeholder="name@email.com"
                    className={`${FIELD_CLASS} mt-1.5`}
                  />
                  <div className="mt-1.5 flex items-center gap-3 empty:hidden">
                    {savedNote('artist', savingArtist)}
                    {artistError ? (
                      <span className="text-xs text-status-error" role="alert">
                        {artistError}
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </KitRow>
            {shareRow}
          </ul>
        )}
      </div>

      {draft ? (
        <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-4">
          <p className="text-sm font-semibold text-content-primary">Here’s a first draft</p>
          <p className="mt-0.5 text-xs text-content-primary/55">Change anything after. It only fills empty parts.</p>
          <div className="mt-4 space-y-4">
            {draft.story ? (
              <div>
                <p className="text-xs font-semibold text-content-tertiary">The story</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-content-primary">{draft.story}</p>
              </div>
            ) : null}
            {draftEntries.map(([key, value]) => (
              <div key={key}>
                <p className="text-xs font-semibold text-content-tertiary">{DRAFT_LABELS[key] ?? key}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-content-primary">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void accept()} disabled={busy} className={PRIMARY_BUTTON}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              Use it
            </button>
            <button type="button" onClick={() => void discard()} disabled={busy} className={QUIET_BUTTON}>
              No thanks
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNotes(true);
                void discard();
              }}
              disabled={busy}
              className="motion-focus min-h-10 px-2 text-sm font-semibold text-brand hover:underline disabled:opacity-60"
            >
              Try again with a hint
            </button>
          </div>
        </div>
      ) : missingWritable ? (
        <div className="mt-3">
          {showNotes ? (
            <textarea
              aria-label="A hint for AI"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={2000}
              autoFocus
              placeholder="Like: we made it in one night in Lagos."
              className={`${FIELD_CLASS} mb-3`}
            />
          ) : null}
          <button
            type="button"
            onClick={() => void fill()}
            disabled={busy}
            className="motion-focus motion-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-content-primary/[0.08] px-4 text-[15px] font-semibold text-brand transition-colors hover:bg-content-primary/[0.12] disabled:opacity-60 sm:w-80"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? 'Writing…' : 'Write the missing parts'}
          </button>
          {isCreditsEnabled() ? (
            <p className="mt-2 text-center text-[13px] text-content-primary/55 sm:w-80">{writeCostLine}</p>
          ) : null}
        </div>
      ) : null}

      {fillError ? (
        <p className="mt-3 text-sm text-status-error" role="alert">
          {fillError}
        </p>
      ) : null}


      <UrgansLockedSheet
        open={Boolean(lockedMessage)}
        message={lockedMessage}
        actionType="epk.fill_both"
        onClose={() => setLockedMessage('')}
      />
    </section>
  );
}
