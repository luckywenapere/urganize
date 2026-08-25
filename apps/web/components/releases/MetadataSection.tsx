'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { MetadataFieldsSkeleton, ShareLinkCardSkeleton } from '@/components/loading/ReleaseSectionSkeletons';
import type { ReleaseMetadataSnapshot } from '@/lib/release-ops';
import {
  GENRE_PREDICTION_ACCEPT_ATTR,
  validateGenrePredictionUpload,
} from '@/lib/genre-prediction';
import { RELEASE_CREDIT_ROLE_LABELS } from '@/types/credits';
import { useSceneData } from './useSceneData';
import { useSceneDataStore, type MetadataScenePayload } from '@/stores/useSceneDataStore';

// The metadata hub (URG-108). Self-contained (the EpkSection pattern): takes
// releaseId, fetches its own data, renders its own loading/empty/error
// states. Hosted by ReleaseScenePanel as an inline panel over the workspace
// (2026-08-04 — it had its own /dashboard/releases/[releaseId]/metadata page
// until then; that route is a redirect stub now). Three sections: editable
// release-level distribution fields, the collaborator credits share link, and
// the submissions collected through it.
//
// Presented as three NUMBERED steps (2026-08-13, founder feedback: the page
// "causes too much cognitive load and the copy and layout is not clear enough
// for a 5th grader to understand what to do"). The steps are labels, not a
// wizard — everything is still on one page, still optional, still doable in any
// order, and no state/fetch logic changed. Two rules for anyone editing copy
// here: name the thing in words a beginner knows before naming it in industry
// terms (ISRC gets a hint, not just a label), and say what is optional out
// loud rather than leaving silence to imply "required".
//
// ROUND TWO (2026-08-25, founder feedback: the page is still "overloaded with
// too much information for when a user just enters that section" — "bring down
// the information so that even a 5th grader would understand what is going on
// there and how to use it intuitively"). Round one fixed the COPY; entering the
// scene still painted all three steps fully open at once — an intro line, three
// headers, three helper paragraphs, all 8 fields with their hints, the explicit
// checkbox, Save, the link card, and an empty-state line. So this pass changes
// what renders on entry, not what it says: each step is now a collapsed card
// (the TasksPanel bucket pattern — collapsed-by-default `<button aria-expanded
// aria-controls>` with a rotating ChevronDown), carrying a plain title and a
// live one-line status chip. Three decisions worth keeping if this gets touched
// again:
//   - All three cards start CLOSED on every entry, with no "smart" auto-open of
//     the next incomplete step. Auto-opening would re-dump the 8-field grid on
//     exactly the first-time user this complaint is about.
//   - The open/closed state is session-only `useState`, NOT persisted to
//     localStorage like the task buckets are. Buckets are a daily working view
//     a user curates; this scene is visited occasionally and the complaint was
//     about *entry*, so every entry has to start calm.
//   - A load error hides all three cards behind ONE error box (there used to be
//     two identical Retry boxes, one per step, plus a third step whose
//     empty-state copy quietly lied during an error) — the whole scene is one
//     fetch, so one error state covers it.
//
// NEXT_PUBLIC_ prefix so the value is inlined at build time for this client
// component. The API routes guard the same flag server-side (404 when off).
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';

// Genre prediction from audio: the Genre field gains a "Predict from audio"
// action that proxies a local audio file to an external classifier model and
// prefills the field. Dark until NEXT_PUBLIC_FEATURE_GENRE_PREDICTION is
// 'true'; the predict-genre route guards the same flag server-side (404 when
// off). Only reachable when METADATA_ENABLED is on too, since this section
// renders nothing otherwise.
const GENRE_PREDICTION_ENABLED = process.env.NEXT_PUBLIC_FEATURE_GENRE_PREDICTION === 'true';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

type MetadataFormState = {
  isrc: string;
  upc: string;
  genre: string;
  subgenre: string;
  language: string;
  explicit: boolean;
  labelName: string;
  cLine: string;
  pLine: string;
};

const EMPTY_FORM: MetadataFormState = {
  isrc: '',
  upc: '',
  genre: '',
  subgenre: '',
  language: '',
  explicit: false,
  labelName: '',
  cLine: '',
  pLine: '',
};

function toFormState(metadata: ReleaseMetadataSnapshot | null): MetadataFormState {
  if (!metadata) return EMPTY_FORM;
  return {
    isrc: metadata.isrc,
    upc: metadata.upc,
    genre: metadata.genre,
    subgenre: metadata.subgenre,
    language: metadata.language,
    explicit: metadata.explicit === true,
    labelName: metadata.labelName,
    cLine: metadata.cLine,
    pLine: metadata.pLine,
  };
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(2)}%`;
}

/** Splits have to add up to 100 — say so in words rather than leaving the
 * reader to work out what "unclaimed" meant, or why 120% is a problem. */
function describeSplitTotal(label: string, total: number): string {
  const rounded = Math.round(total * 100) / 100;
  if (rounded === 100) return `${label} add up to 100%. Nothing missing.`;
  if (rounded > 100) {
    return `${label} add up to ${formatPercent(total)} — that is ${formatPercent(
      total - 100
    )} too much. They should total 100%.`;
  }
  return `${label} add up to ${formatPercent(total)} — ${formatPercent(
    100 - total
  )} still missing. They should total 100%.`;
}

function splitTotalTone(total: number): string {
  return Math.round(total * 100) / 100 === 100 ? 'text-content-secondary' : 'text-status-warning';
}

/** Whether a split total needs a flag on the collapsed Step 3 chip — reuses
 * splitTotalTone's own rounding so the chip and the in-card banner can never
 * disagree about what "off" means. */
function splitTotalIsOff(total: number): boolean {
  return splitTotalTone(total) === 'text-status-warning';
}

type StepKey = 'details' | 'credits' | 'answers';

type MetadataSectionProps = {
  releaseId: string;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

export function MetadataSection({ releaseId, onToast }: MetadataSectionProps) {
  // One cached scene covers both endpoints this section reads (metadata +
  // credits), fetched in parallel by the store. Cache-first, so re-opening
  // Metadata — or opening it after the workspace's idle prefetch has warmed
  // it — paints immediately with no skeleton.
  const {
    data,
    isLoading,
    error: loadError,
    reload: reloadScene,
  } = useSceneData(releaseId, 'metadata', { enabled: METADATA_ENABLED });
  const setScene = useSceneDataStore((state) => state.setScene);

  const link = data?.link ?? null;
  const submissions = useMemo(() => data?.submissions ?? [], [data]);

  // --- Collapsed-card state ---------------------------------------------------
  // Session-only and all-closed on every mount — see the ROUND TWO doc comment
  // above for why this deliberately does not persist like the task buckets do.
  const [openSteps, setOpenSteps] = useState<Record<StepKey, boolean>>({
    details: false,
    credits: false,
    answers: false,
  });
  const toggleStep = (key: StepKey) =>
    setOpenSteps((current) => ({ ...current, [key]: !current[key] }));
  const detailsBodyId = useId();
  const creditsBodyId = useId();
  const answersBodyId = useId();

  // --- Release-level fields -------------------------------------------------
  const [form, setForm] = useState<MetadataFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isPredictingGenre, setIsPredictingGenre] = useState(false);
  const genreFileInputRef = useRef<HTMLInputElement>(null);
  // The form is seeded FROM the cached/fetched snapshot, so a background
  // revalidate landing mid-edit would otherwise silently overwrite whatever
  // the user is typing. Once they touch a field, the server copy stops being
  // allowed to reseed until the next successful save.
  const isFormDirtyRef = useRef(false);
  const editForm = useCallback((update: (current: MetadataFormState) => MetadataFormState) => {
    isFormDirtyRef.current = true;
    setForm(update);
  }, []);

  useEffect(() => {
    if (isFormDirtyRef.current || !data) return;
    setForm(toFormState(data.metadata));
  }, [data]);

  // --- Credits share link ----------------------------------------------------
  const [isMutatingLink, setIsMutatingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- Submissions -------------------------------------------------------------
  const [deletingId, setDeletingId] = useState('');

  const shareUrl = link
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/credits/${link.shareToken}`
    : '';

  /** Write-through helper: mutations return the authoritative row, so the
   * cache is patched directly instead of costing another round trip. */
  const patchScene = useCallback(
    (patch: Partial<MetadataScenePayload>) => {
      setScene(releaseId, 'metadata', {
        metadata: data?.metadata ?? null,
        link: data?.link ?? null,
        submissions: data?.submissions ?? [],
        ...patch,
      });
    },
    [data, releaseId, setScene]
  );

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleSaveMetadata = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as {
        metadata?: ReleaseMetadataSnapshot;
        error?: string;
      };
      if (!res.ok) {
        onToast?.(data.error || 'Could not save metadata.', 'error');
        return;
      }
      const saved = data.metadata ?? null;
      isFormDirtyRef.current = false;
      setForm(toFormState(saved));
      patchScene({ metadata: saved });
      onToast?.('Metadata saved.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not save metadata.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePredictGenre = async (file: File) => {
    if (isPredictingGenre) return;

    // Same validation the route runs, so an oversized or non-audio pick fails
    // instantly instead of spending an upload.
    const validation = validateGenrePredictionUpload({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    });
    if (!validation.ok) {
      onToast?.(validation.error, 'error');
      return;
    }

    setIsPredictingGenre(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const body = new FormData();
      body.append('file', file, file.name);
      // No Content-Type header — the browser sets the multipart boundary.
      const res = await fetch(`/api/releases/${releaseId}/metadata/predict-genre`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = (await res.json().catch(() => ({}))) as {
        genre?: string;
        confidence?: number | null;
        error?: string;
      };
      if (!res.ok || !data.genre) {
        onToast?.(data.error || 'Could not predict a genre from that file.', 'error');
        return;
      }
      // The form has no dirty tracking — "Save details" is always enabled — so
      // filling the field is all that's needed. Nothing persists until the
      // user saves, and the audio itself is never stored.
      const genre = data.genre;
      editForm((f) => ({ ...f, genre }));
      const confidenceSuffix =
        typeof data.confidence === 'number'
          ? ` (${Math.round(data.confidence * 100)}% confidence)`
          : '';
      onToast?.(`Predicted genre: ${genre}${confidenceSuffix} — review and save.`, 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not predict a genre.', 'error');
    } finally {
      setIsPredictingGenre(false);
    }
  };

  const handleCreateLink = async () => {
    if (isMutatingLink) return;
    setIsMutatingLink(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/credits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { link?: MetadataScenePayload['link']; error?: string };
      if (!res.ok || !data.link?.shareToken) {
        onToast?.(data.error || 'Could not create the credits link.', 'error');
        return;
      }
      patchScene({ link: data.link });
      onToast?.('Credits link is live.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not create the credits link.', 'error');
    } finally {
      setIsMutatingLink(false);
    }
  };

  const handleRegenerateLink = async () => {
    if (isMutatingLink) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Make a new link? The old one stops working right away, so anyone you already sent it to will need the new one. Answers you have already collected are safe.'
      );
      if (!confirmed) return;
    }
    setIsMutatingLink(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/credits`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { link?: MetadataScenePayload['link']; error?: string };
      if (!res.ok || !data.link?.shareToken) {
        onToast?.(data.error || 'Could not regenerate the credits link.', 'error');
        return;
      }
      patchScene({ link: data.link });
      onToast?.('Credits link regenerated. The old link no longer works.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not regenerate the credits link.', 'error');
    } finally {
      setIsMutatingLink(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      onToast?.('Could not copy — select the link and copy it manually.', 'warning');
    }
  };

  const handleDeleteSubmission = async (submissionId: string, legalName: string) => {
    if (deletingId) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `Remove ${legalName || 'this submission'}? They can resubmit through the same link.`
      );
      if (!confirmed) return;
    }
    setDeletingId(submissionId);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/credits/submissions/${submissionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        onToast?.(data.error || 'Could not remove the submission.', 'error');
        return;
      }
      patchScene({ submissions: submissions.filter((item) => item.id !== submissionId) });
      onToast?.('Submission removed.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not remove the submission.', 'error');
    } finally {
      setDeletingId('');
    }
  };

  const totalSongwriterSplit = useMemo(
    () => submissions.reduce((sum, item) => sum + (item.songwriterSplit ?? 0), 0),
    [submissions]
  );
  const totalMasterSplit = useMemo(
    () => submissions.reduce((sum, item) => sum + (item.masterSplit ?? 0), 0),
    [submissions]
  );
  const hasAnySongwriterSplit = submissions.some((item) => item.songwriterSplit !== null);
  const hasAnyMasterSplit = submissions.some((item) => item.masterSplit !== null);
  const splitsNeedAttention =
    (hasAnySongwriterSplit && splitTotalIsOff(totalSongwriterSplit)) ||
    (hasAnyMasterSplit && splitTotalIsOff(totalMasterSplit));

  // "N of 8 filled in" — the explicit checkbox is a yes/no, not a blank to
  // fill, so it stays out of the count.
  const filledFieldCount = useMemo(
    () =>
      [form.genre, form.subgenre, form.language, form.labelName, form.isrc, form.upc, form.pLine, form.cLine].filter(
        (value) => value.trim() !== ''
      ).length,
    [form]
  );

  if (!METADATA_ENABLED) return null;

  const answersChipLabel =
    submissions.length > 0 ? `${submissions.length} answer${submissions.length === 1 ? '' : 's'}` : 'No answers yet';

  return (
    <div className="mt-8 space-y-4">
      {/* One plain sentence saying what this whole page is for AND how to use
          it — the interaction itself ("tap a step") is part of the 5th-grader
          bar, not just the vocabulary (founder feedback, round two, 2026-08-25). */}
      <p className="text-sm leading-relaxed text-content-secondary">
        Everything music stores need for this song, in three steps. Tap a step to open it —
        everything is optional.
      </p>

      {loadError ? (
        // One error box for the whole scene, not one per step: it is a single
        // fetch, and letting each step's body render its own copy of the form
        // risks saving blanks over real data mid-error.
        <div className="flex flex-col gap-3 border border-status-error/30 bg-status-error/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-status-error">{loadError}</p>
          <button
            type="button"
            onClick={() => void reloadScene()}
            className="inline-flex h-9 shrink-0 items-center self-start border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover sm:self-auto"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Step 1: release details */}
          <div className="overflow-hidden rounded-xl border border-stroke-default bg-bg-surface">
            <button
              type="button"
              onClick={() => toggleStep('details')}
              aria-expanded={openSteps.details}
              aria-controls={detailsBodyId}
              className={`motion-focus flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-hover ${
                openSteps.details ? 'border-b border-stroke-subtle' : ''
              }`}
            >
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                Step 1 · The song&rsquo;s details
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {isLoading ? (
                  <SkeletonBlock className="h-3 w-20" />
                ) : (
                  <span className={`text-[11px] ${filledFieldCount === 8 ? 'text-brand' : 'text-content-tertiary'}`}>
                    {filledFieldCount} of 8 filled in
                  </span>
                )}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${
                    openSteps.details ? '' : '-rotate-90'
                  }`}
                  aria-hidden="true"
                />
              </span>
            </button>
            {openSteps.details ? (
              <div id={detailsBodyId} className="p-4">
                <p className="text-sm text-content-secondary">
                  Music stores like Spotify and Apple ask for these when a song goes out. Every field
                  is optional — fill in what you know now and come back for the rest.
                </p>

                {isLoading ? (
                  <MetadataFieldsSkeleton />
                ) : (
                  // Ordered easiest-first on purpose: the form opens on words a
                  // beginner already knows (genre, language) rather than on ISRC/UPC,
                  // which read as a wall of acronyms and used to be the first thing
                  // anyone saw.
                  <div className="mt-4 grid grid-cols-1 gap-4 border border-stroke-default bg-bg-surface p-4 sm:grid-cols-2">
                    <Field
                      label="Genre"
                      hint="The main style of the music, like Afrobeats or Hip-hop."
                      value={form.genre}
                      onChange={(v) => editForm((f) => ({ ...f, genre: v }))}
                      labelAction={
                        GENRE_PREDICTION_ENABLED ? (
                          <>
                            <input
                              ref={genreFileInputRef}
                              type="file"
                              accept={GENRE_PREDICTION_ACCEPT_ATTR}
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                // Reset so picking the same file again still fires.
                                event.target.value = '';
                                if (file) void handlePredictGenre(file);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => genreFileInputRef.current?.click()}
                              disabled={isPredictingGenre || isSaving}
                              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                            >
                              {isPredictingGenre ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3" />
                              )}
                              {isPredictingGenre ? 'Predicting…' : 'Predict from audio'}
                            </button>
                          </>
                        ) : undefined
                      }
                    />
                    <Field
                      label="Subgenre"
                      hint="A more specific style, like Amapiano or Drill. Leave blank if none fits."
                      value={form.subgenre}
                      onChange={(v) => editForm((f) => ({ ...f, subgenre: v }))}
                    />
                    <Field
                      label="Language"
                      hint="The language of the lyrics, like English or Yoruba."
                      value={form.language}
                      onChange={(v) => editForm((f) => ({ ...f, language: v }))}
                    />
                    <Field
                      label="Label name"
                      hint="The label putting this out. Use the artist's name if there's no label."
                      value={form.labelName}
                      onChange={(v) => editForm((f) => ({ ...f, labelName: v }))}
                    />
                    <Field
                      label="ISRC"
                      hint="The ID code for this one recording. Your distributor gives it to you — leave blank if you don't have it yet."
                      value={form.isrc}
                      onChange={(v) => editForm((f) => ({ ...f, isrc: v }))}
                    />
                    <Field
                      label="UPC"
                      hint="The barcode number for the whole release. Also from your distributor."
                      value={form.upc}
                      onChange={(v) => editForm((f) => ({ ...f, upc: v }))}
                    />
                    <Field
                      label="℗ line (who owns the recording)"
                      hint="The year, then whoever owns the recording."
                      placeholder="℗ 2026 Some Label"
                      value={form.pLine}
                      onChange={(v) => editForm((f) => ({ ...f, pLine: v }))}
                    />
                    <Field
                      label="© line (who owns the words and artwork)"
                      hint="The year, then whoever owns the song itself."
                      placeholder="© 2026 Some Label"
                      value={form.cLine}
                      onChange={(v) => editForm((f) => ({ ...f, cLine: v }))}
                    />
                    <label className="flex items-center gap-2 text-sm text-content-secondary sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={form.explicit}
                        onChange={(event) => editForm((f) => ({ ...f, explicit: event.target.checked }))}
                        className="h-4 w-4 accent-brand"
                      />
                      This song has explicit content (swearing or adult themes)
                    </label>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveMetadata()}
                        disabled={isSaving}
                        className="inline-flex h-9 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {isSaving ? 'Saving…' : 'Save details'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Step 2: credits share link */}
          <div className="overflow-hidden rounded-xl border border-stroke-default bg-bg-surface">
            <button
              type="button"
              onClick={() => toggleStep('credits')}
              aria-expanded={openSteps.credits}
              aria-controls={creditsBodyId}
              className={`motion-focus flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-hover ${
                openSteps.credits ? 'border-b border-stroke-subtle' : ''
              }`}
            >
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                Step 2 · Collect everyone&rsquo;s credits
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {isLoading ? (
                  <SkeletonBlock className="h-3 w-16" />
                ) : (
                  <span className={`text-[11px] ${link ? 'text-brand' : 'text-content-tertiary'}`}>
                    {link ? 'Link is live' : 'No link yet'}
                  </span>
                )}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${
                    openSteps.credits ? '' : '-rotate-90'
                  }`}
                  aria-hidden="true"
                />
              </span>
            </button>
            {openSteps.credits ? (
              <div id={creditsBodyId} className="p-4">
                <p className="text-sm text-content-secondary">
                  Anyone who worked on this song — producers, writers, engineers — fills out one
                  short form. Copy the link and send it to them on WhatsApp, text, or email. They
                  don&rsquo;t need an account.
                </p>

                {isLoading ? (
                  <ShareLinkCardSkeleton />
                ) : !link ? (
                  <div className="mt-4 border border-stroke-default bg-bg-surface p-6 text-center">
                    <p className="text-sm text-content-secondary">
                      One link works for everyone who worked on this song.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCreateLink()}
                      disabled={isMutatingLink}
                      className="mt-3 inline-flex items-center gap-2 border border-brand/25 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isMutatingLink ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Creating…
                        </>
                      ) : (
                        <>
                          <ClipboardList className="h-3.5 w-3.5" />
                          Create the link
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 border border-stroke-default bg-bg-surface p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <p className="min-w-0 flex-1 truncate font-mono text-xs text-content-secondary" title={shareUrl}>
                        {shareUrl}
                      </p>
                      {/* `sm:shrink-0` used to sit on this group and it made the
                          `flex-wrap` beside it dead code: flex-shrink:0 pins the
                          group at its ~350px max-content width, so instead of
                          wrapping it OVERFLOWED the card and got clipped
                          mid-word ("Regener…" — founder screenshot,
                          2026-08-25). The group shrinks now and each button
                          carries `shrink-0 whitespace-nowrap` instead, so they
                          move whole onto a second row rather than compressing
                          and breaking their own labels inside a fixed h-9 —
                          the same fix TasksPanel's pills took on 2026-08-10.
                          The URL beside them is `flex-1` with a 0 basis, so it
                          absorbs none of the shrinkage and keeps truncating. */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCopy()}
                          className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-primary hover:bg-bg-hover"
                        >
                          {copied ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-brand" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy link
                            </>
                          )}
                        </button>
                        <a
                          href={shareUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-primary hover:bg-bg-hover"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open form
                        </a>
                        <button
                          type="button"
                          onClick={() => void handleRegenerateLink()}
                          disabled={isMutatingLink}
                          className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-status-warning disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isMutatingLink ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Regenerate
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-content-tertiary">
                      Need a fresh link? Tap Regenerate: the old one stops working right away, and
                      answers you already collected are safe.
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Step 3: submissions */}
          <div className="overflow-hidden rounded-xl border border-stroke-default bg-bg-surface">
            <button
              type="button"
              onClick={() => toggleStep('answers')}
              aria-expanded={openSteps.answers}
              aria-controls={answersBodyId}
              className={`motion-focus flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-hover ${
                openSteps.answers ? 'border-b border-stroke-subtle' : ''
              }`}
            >
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                Step 3 · Their answers land here
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {isLoading ? (
                  <SkeletonBlock className="h-3 w-20" />
                ) : (
                  <span
                    className={`text-[11px] ${
                      submissions.length > 0 ? 'text-content-secondary' : 'text-content-tertiary'
                    }`}
                  >
                    {answersChipLabel}
                    {splitsNeedAttention ? <span className="text-status-warning"> · check the shares</span> : null}
                  </span>
                )}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${
                    openSteps.answers ? '' : '-rotate-90'
                  }`}
                  aria-hidden="true"
                />
              </span>
            </button>
            {openSteps.answers ? (
              <div id={answersBodyId} className="p-4">
                {submissions.length === 0 ? (
                  <p className="text-sm text-content-secondary">
                    {link
                      ? 'Nothing yet. Once you share the link, each person’s answer shows up here on its own.'
                      : 'Create the link in step 2 first, then share it. Answers show up here as they come in.'}
                  </p>
                ) : (
                  <>
                    {(hasAnySongwriterSplit || hasAnyMasterSplit) && (
                      <div className="flex flex-col gap-2 border border-stroke-default bg-bg-surface p-4 text-sm sm:flex-row sm:items-center sm:gap-6">
                        {hasAnySongwriterSplit && (
                          <p className={splitTotalTone(totalSongwriterSplit)}>
                            {describeSplitTotal('Writing shares', totalSongwriterSplit)}
                          </p>
                        )}
                        {hasAnyMasterSplit && (
                          <p className={splitTotalTone(totalMasterSplit)}>
                            {describeSplitTotal('Recording shares', totalMasterSplit)}
                          </p>
                        )}
                      </div>
                    )}

                    <div className={`space-y-3 ${hasAnySongwriterSplit || hasAnyMasterSplit ? 'mt-4' : ''}`}>
                      {submissions.map((submission) => (
                        <SubmissionCard
                          key={submission.id}
                          submission={submission}
                          isDeleting={deletingId === submission.id}
                          onDelete={() => void handleDeleteSubmission(submission.id, submission.legalName)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  labelAction,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  labelAction?: React.ReactNode;
  /** Plain-English explanation of what the field wants. Sits under the input
   * and is wired up with aria-describedby, so a screen reader hears it too. */
  hint?: string;
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const input = (
    <input
      id={inputId}
      type="text"
      value={value}
      placeholder={placeholder}
      aria-describedby={hint ? hintId : undefined}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1 w-full border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
    />
  );
  const hintLine = hint ? (
    <p id={hintId} className="mt-1 text-xs leading-snug text-content-tertiary">
      {hint}
    </p>
  ) : null;

  // With a label action, the wrapper becomes a div and the label text an
  // explicit <label htmlFor> — a button must not nest inside a <label>, or
  // clicking it would also activate the labelled input.
  if (labelAction) {
    return (
      <div className="block text-sm">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className="text-xs text-content-tertiary">
            {label}
          </label>
          {labelAction}
        </div>
        {input}
        {hintLine}
      </div>
    );
  }

  return (
    <div className="block text-sm">
      {/* An explicit <label htmlFor> rather than a wrapping <label>: the hint
          is a sibling paragraph, and wrapping it would make the hint text part
          of the input's clickable label. */}
      <label htmlFor={inputId} className="text-xs text-content-tertiary">
        {label}
      </label>
      {input}
      {hintLine}
    </div>
  );
}

function SubmissionCard({
  submission,
  isDeleting,
  onDelete,
}: {
  submission: MetadataScenePayload['submissions'][number];
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const submittedDate = submission.createdAt
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(submission.createdAt)
      )
    : '';

  const contactLine = [submission.email, submission.phone].filter(Boolean).join(' · ');
  const publishingLine = [
    submission.proAffiliation && `PRO: ${submission.proAffiliation}`,
    submission.ipiNumber && `IPI: ${submission.ipiNumber}`,
    submission.publisherName && `Publisher: ${submission.publisherName}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const socialsLine = [
    submission.instagramHandle && `IG @${submission.instagramHandle.replace(/^@/, '')}`,
    submission.xHandle && `X @${submission.xHandle.replace(/^@/, '')}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-content-primary">
            {submission.legalName}
            {submission.stageName ? (
              <span className="font-normal text-content-tertiary"> · {submission.stageName}</span>
            ) : null}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {submission.roles.map((role) => (
              <span
                key={role}
                className="rounded-full border border-stroke-subtle bg-bg-elevated px-2 py-px text-[11px] text-content-secondary"
              >
                {RELEASE_CREDIT_ROLE_LABELS[role] || role}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="inline-flex h-8 shrink-0 items-center gap-1 border border-stroke-default bg-bg-elevated px-2 text-xs text-content-secondary hover:bg-bg-hover hover:text-status-error disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Remove
        </button>
      </div>

      {submission.contribution ? (
        <p className="mt-2 text-sm text-content-secondary">{submission.contribution}</p>
      ) : null}

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-content-tertiary sm:grid-cols-2">
        {(submission.songwriterSplit !== null || submission.masterSplit !== null) && (
          <div>
            {submission.songwriterSplit !== null ? (
              <span>Writer split: {formatPercent(submission.songwriterSplit)}</span>
            ) : null}
            {submission.songwriterSplit !== null && submission.masterSplit !== null ? ' · ' : ''}
            {submission.masterSplit !== null ? (
              <span>Master split: {formatPercent(submission.masterSplit)}</span>
            ) : null}
          </div>
        )}
        {publishingLine ? <div>{publishingLine}</div> : null}
        {contactLine ? <div>{contactLine}</div> : null}
        {socialsLine ? <div>{socialsLine}</div> : null}
      </dl>

      {submission.bio ? (
        <p className="mt-3 whitespace-pre-line text-xs text-content-tertiary">{submission.bio}</p>
      ) : null}

      {submittedDate ? (
        <p className="mt-3 text-[11px] uppercase tracking-[0.1em] text-content-tertiary">
          Submitted {submittedDate}
        </p>
      ) : null}
    </div>
  );
}
