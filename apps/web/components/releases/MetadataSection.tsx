'use client';

import { CreditClaimInvites } from './CreditClaimInvites';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Lock,
  LockOpen,
  RefreshCw,
  Trash2,
} from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { MetadataFieldsSkeleton, ShareLinkCardSkeleton } from '@/components/loading/ReleaseSectionSkeletons';
import type { ReleaseMetadataSnapshot } from '@/lib/release-ops';
import { describeSplitTotal, formatPercent, splitTotalIsOff } from '@/lib/credit-split-totals';
import {
  metadataFieldElementId,
  metadataStepElementId,
  metadataStepForField,
  type MetadataFixField,
} from '@/lib/distribution-fix';
import { RELEASE_CREDIT_ROLE_LABELS } from '@/types/credits';
import {
  buildCreditSubmissionsCsv,
  creditsCsvFileName,
} from '@/lib/credit-submissions-csv';
import { shareOrDownloadTextFile } from '@/lib/share-file';
import { HelpTip } from '@/components/shared/HelpTip';
import { HELP_COPY, type HelpKey } from '@/lib/help-copy';
import { useSceneData } from './useSceneData';
import { useSceneDataStore, type MetadataScenePayload } from '@/stores/useSceneDataStore';
import { currentShareOrigin } from '@/lib/app-hosts';

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
// ROUND THREE (2026-08-27, founder spec "Metadata Collection Link"). Four
// things worth knowing before editing this file:
//   - Step 2's link has THREE states, not two: no link / live / closed. Closing
//     does not touch the token or any answer — the URL keeps resolving and the
//     public page shows a "this request is closed" note instead of the form, so
//     reopening brings the same link back. Regenerate still rotates the token
//     AND clears the closed state, because "give me a new link" means the owner
//     wants a working one.
//   - `patchScene` reads the store at call time rather than the render closure.
//     Metadata now always revalidates in the background on open
//     (SCENE_REVALIDATE_ON_LOAD in lib/scene-cache.ts, so a submission that
//     lands while the owner is looking is never hidden by the 30s freshness
//     window), which means a fetch can resolve between a render and a mutation.
//   - Every field the public form collects is now rendered in SubmissionCard.
//     `country` and `publisherIpi` were captured from day one and shown
//     nowhere, so an owner preparing a distributor handoff could not tell they
//     had them.
//   - Splits display at ONE decimal place, matching what the public form now
//     accepts (lib/credit-submissions.ts). Legacy 2dp rows display rounded.
//
// NEXT_PUBLIC_ prefix so the value is inlined at build time for this client
// component. The API routes guard the same flag server-side (404 when off).
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

type MetadataFormState = {
  isrc: string;
  upc: string;
  iswc: string;
  genre: string;
  subgenre: string;
  language: string;
  /** Null until somebody answers. Unset is not the same as "not explicit": the
   * distribution check refuses a rollout whose flag was never set. */
  explicit: boolean | null;
  labelName: string;
  featuredArtists: string;
  cLine: string;
  pLine: string;
  lyrics: string;
};

const EMPTY_FORM: MetadataFormState = {
  isrc: '',
  upc: '',
  iswc: '',
  genre: '',
  subgenre: '',
  language: '',
  explicit: null,
  labelName: '',
  featuredArtists: '',
  cLine: '',
  pLine: '',
  lyrics: '',
};

function toFormState(metadata: ReleaseMetadataSnapshot | null): MetadataFormState {
  if (!metadata) return EMPTY_FORM;
  return {
    isrc: metadata.isrc,
    upc: metadata.upc,
    iswc: metadata.iswc,
    genre: metadata.genre,
    subgenre: metadata.subgenre,
    language: metadata.language,
    // Null stays null. This used to read `=== true`, which turned "never
    // answered" into false and saved it on the next click of Save details.
    explicit: metadata.explicit,
    labelName: metadata.labelName,
    featuredArtists: metadata.featuredArtists,
    cLine: metadata.cLine,
    pLine: metadata.pLine,
    lyrics: metadata.lyrics ?? '',
  };
}

/** The blanks the Step 1 chip counts. The explicit checkbox is a yes/no rather
 * than a blank to fill, so it stays out. */
const COUNTED_METADATA_FIELDS = [
  'genre',
  'subgenre',
  'language',
  'labelName',
  'featuredArtists',
  'isrc',
  'upc',
  'iswc',
  'pLine',
  'cLine',
] as const satisfies readonly (keyof MetadataFormState)[];

function splitTotalTone(total: number): string {
  return splitTotalIsOff(total) ? 'text-status-warning' : 'text-content-secondary';
}

/** Whether a split total needs a flag on the collapsed Step 3 chip is
 * splitTotalIsOff (lib/credit-split-totals.ts), the same rule the distribution
 * check uses, so the chip, the in-card banner and the warning cannot disagree. */

type StepKey = 'details' | 'credits' | 'answers';

type MetadataSectionProps = {
  releaseId: string;
  /** Only used to name the exported spreadsheet. Optional so the scene keeps
   * working for any caller that does not have it in hand. */
  releaseTitle?: string;
  /** A field the distribution check sent the person here to fix (a Fix button).
   * The step that holds it opens and the input takes focus once the form is
   * on screen. */
  focusField?: MetadataFixField | null;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

export function MetadataSection({
  releaseId,
  releaseTitle,
  focusField = null,
  onToast,
}: MetadataSectionProps) {
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
  // The one exception to "all closed on entry": a person who tapped Fix on the
  // distribution check lands with the step that holds the thing to fix already
  // open. Seeded here and not from an effect, so the first paint is the right one.
  const [openSteps, setOpenSteps] = useState<Record<StepKey, boolean>>(() => {
    const requested = focusField ? metadataStepForField(focusField) : null;
    return {
      details: requested === 'details',
      credits: requested === 'credits',
      answers: requested === 'answers',
    };
  });
  const toggleStep = (key: StepKey) =>
    setOpenSteps((current) => ({ ...current, [key]: !current[key] }));
  const detailsBodyId = useId();
  const creditsBodyId = useId();
  const answersBodyId = useId();
  const explicitGroupName = useId();

  // --- Release-level fields -------------------------------------------------
  const [form, setForm] = useState<MetadataFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
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

  // --- Landing on a field from a Fix button -------------------------------------
  // Focus the input (or, for the credits steps, the step's own header) and bring
  // it into view, once the form has rendered. Once per field, so a background
  // revalidate cannot pull focus back after the person has moved on.
  const landedOnRef = useRef<MetadataFixField | null>(null);
  useEffect(() => {
    if (!focusField || isLoading || landedOnRef.current === focusField) return;
    const step = metadataStepForField(focusField);
    const targetId =
      focusField === 'credits' || focusField === 'splits'
        ? metadataStepElementId(step)
        : metadataFieldElementId(focusField);
    const element = document.getElementById(targetId);
    if (!element) return;
    landedOnRef.current = focusField;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'center' });
  }, [focusField, isLoading]);

  // --- Credits share link ----------------------------------------------------
  const [isMutatingLink, setIsMutatingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- Submissions -------------------------------------------------------------
  const [deletingId, setDeletingId] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const shareUrl = link
    ? `${currentShareOrigin()}/credits/${link.shareToken}`
    : '';
  /** A closed link still resolves: the public page shows a "this request is
   * closed" message instead of the form, so the URL stays valid and reopening
   * brings the same link back to life. */
  const isLinkClosed = Boolean(link?.closedAt);

  /** Write-through helper: mutations return the authoritative row, so the
   * cache is patched directly instead of costing another round trip.
   *
   * The base payload is read from the STORE at call time, not from the `data`
   * captured when this callback was created. Metadata now always revalidates in
   * the background on open (SCENE_REVALIDATE_ON_LOAD), so a fetch can land
   * between a render and a mutation resolving — and merging onto the older
   * closure copy would re-stamp superseded submissions as fresh. */
  const patchScene = useCallback(
    (
      patch:
        | Partial<MetadataScenePayload>
        | ((current: MetadataScenePayload) => Partial<MetadataScenePayload>)
    ) => {
      const held = useSceneDataStore.getState().getScene(releaseId, 'metadata');
      const base: MetadataScenePayload = {
        metadata: held?.metadata ?? null,
        link: held?.link ?? null,
        submissions: held?.submissions ?? [],
      };
      setScene(releaseId, 'metadata', {
        ...base,
        ...(typeof patch === 'function' ? patch(base) : patch),
      });
    },
    [releaseId, setScene]
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

  /**
   * Close or reopen the link. No window.confirm on purpose: this repo reserves
   * confirms for the irreversible (Regenerate kills a URL that may already be
   * in someone's WhatsApp, Remove destroys an answer), and closing is one tap
   * to undo with every submission untouched.
   */
  const handleToggleClosed = async (action: 'close' | 'reopen') => {
    if (isMutatingLink) return;
    setIsMutatingLink(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/credits`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        link?: MetadataScenePayload['link'];
        error?: string;
      };
      if (!res.ok || !data.link) {
        onToast?.(data.error || 'Could not update the credits link.', 'error');
        return;
      }
      patchScene({ link: data.link });
      onToast?.(
        action === 'close'
          ? 'Link closed. No new answers can come in.'
          : 'Link reopened. Answers can come in again.',
        'success'
      );
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not update the credits link.', 'error');
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
      onToast?.('Could not copy. Select the link and copy it by hand.', 'warning');
    }
  };

  /**
   * Hand the owner every submission as a spreadsheet.
   *
   * Entirely client-side: the scene already holds all of them, so there is no
   * route and no second fetch. Goes through shareOrDownloadTextFile rather than
   * a plain anchor because a webview cannot download — on native it opens the
   * share sheet, and on an old shell without the plugins it says so instead of
   * doing nothing (the DataExportSection precedent).
   */
  const handleExportCsv = async () => {
    if (isExporting || submissions.length === 0) return;
    setIsExporting(true);
    try {
      const outcome = await shareOrDownloadTextFile({
        contents: buildCreditSubmissionsCsv(submissions),
        fileName: creditsCsvFileName(releaseTitle || '', new Date().toISOString()),
        mimeType: 'text/csv;charset=utf-8',
        title: 'Collaborator credits',
      });
      if (outcome === 'unsupported') {
        onToast?.(
          'This app version cannot save files. Open my.urganize.app in your browser and export from there.',
          'warning'
        );
      } else if (outcome === 'downloaded') {
        onToast?.('Credits downloaded as a spreadsheet.', 'success');
      } else if (outcome === 'shared') {
        onToast?.('Your spreadsheet is ready to save.', 'success');
      }
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not build the spreadsheet.', 'error');
    } finally {
      setIsExporting(false);
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
      patchScene((current) => ({
        submissions: current.submissions.filter((item) => item.id !== submissionId),
      }));
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

  // "N of 9 filled in" — derived from COUNTED_METADATA_FIELDS so the count and
  // the total can never disagree when a field is added.
  const filledFieldCount = useMemo(
    () => COUNTED_METADATA_FIELDS.filter((field) => String(form[field]).trim() !== '').length,
    [form]
  );

  if (!METADATA_ENABLED) return null;

  const answersChipLabel =
    submissions.length > 0 ? `${submissions.length} answer${submissions.length === 1 ? '' : 's'}` : 'No answers yet';

  return (
    <div className="mt-8 space-y-4">
      {/* ROUND FOUR (2026-09-08): one sentence, down from three. The other two
          said "tap a step to open it" and "nothing here is required" — the
          first is what a row of chevrons already communicates, and the second
          is now on the step that actually has the fields, where it is true and
          useful rather than a blanket disclaimer read before anything is on
          screen. */}
      <p className="text-sm leading-relaxed text-content-secondary">
        Everything music stores need for this song, in three steps.
      </p>

      {loadError && !data ? (
        // One error box for the whole scene, not one per step: it is a single
        // fetch, and letting each step's body render its own copy of the form
        // risks saving blanks over real data mid-error. Blocking ONLY when
        // there is nothing to show — with cached data on screen, the banner
        // inside the cards branch below reports the failure instead of
        // hiding a perfectly good payload behind it (the CuratorLoadError
        // blocking-vs-banner split).
        <div className="flex flex-col gap-3 border border-status-error/30 bg-status-error/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm text-status-error">{loadError}</p>
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
          {loadError ? (
            // Stale-but-usable: the refresh failed but a cached payload is on
            // screen (the store keeps it on a failed revalidate). Keep the
            // cards; say so above them.
            <div className="flex flex-col gap-3 border border-status-error/30 bg-status-error/10 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p role="alert" className="text-xs text-status-error">
                Couldn&rsquo;t refresh this page. Showing what we have. {loadError}
              </p>
              <button
                type="button"
                onClick={() => void reloadScene()}
                className="inline-flex h-8 shrink-0 items-center self-start border border-stroke-default bg-bg-elevated px-3 text-xs font-semibold text-content-primary hover:bg-bg-hover sm:self-auto"
              >
                Retry
              </button>
            </div>
          ) : null}
          {/* Step 1: release details */}
          <div className="overflow-hidden rounded-xl border border-stroke-default bg-bg-surface">
            <button
              type="button"
              id={metadataStepElementId('details')}
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
                  <span
                    className={`text-[11px] ${
                      filledFieldCount === COUNTED_METADATA_FIELDS.length
                        ? 'text-brand'
                        : 'text-content-tertiary'
                    }`}
                  >
                    {filledFieldCount} of {COUNTED_METADATA_FIELDS.length} filled in
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
                {/* The visible line says what to DO; the pullout says who is
                    asking and why. Complementary rather than the same sentence
                    twice — see the Field docblock for the same split applied to
                    each of the nine boxes below. */}
                <p className="text-sm text-content-secondary">
                  Every box is optional. Fill in what you know now.{' '}
                  <HelpTip helpKey="metadata.step.details" className="align-text-bottom" />
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
                      help="metadata.field.genre"
                      fieldKey="genre"
                      value={form.genre}
                      onChange={(v) => editForm((f) => ({ ...f, genre: v }))}
                    />
                    <Field
                      label="Subgenre"
                      help="metadata.field.subgenre"
                      value={form.subgenre}
                      onChange={(v) => editForm((f) => ({ ...f, subgenre: v }))}
                    />
                    <Field
                      label="Language"
                      help="metadata.field.language"
                      fieldKey="language"
                      value={form.language}
                      onChange={(v) => editForm((f) => ({ ...f, language: v }))}
                    />
                    <Field
                      label="Label name"
                      help="metadata.field.labelName"
                      value={form.labelName}
                      onChange={(v) => editForm((f) => ({ ...f, labelName: v }))}
                    />
                    <Field
                      label="Featured artist"
                      help="metadata.field.featuredArtists"
                      fieldKey="featured_artists"
                      value={form.featuredArtists}
                      onChange={(v) => editForm((f) => ({ ...f, featuredArtists: v }))}
                    />
                    <Field
                      label="ISRC"
                      help="metadata.field.isrc"
                      value={form.isrc}
                      onChange={(v) => editForm((f) => ({ ...f, isrc: v }))}
                    />
                    <Field
                      label="UPC"
                      help="metadata.field.upc"
                      fieldKey="upc"
                      value={form.upc}
                      onChange={(v) => editForm((f) => ({ ...f, upc: v }))}
                    />
                    <Field
                      label="ISWC"
                      help="metadata.field.iswc"
                      placeholder="T-123456789-1"
                      value={form.iswc}
                      onChange={(v) => editForm((f) => ({ ...f, iswc: v }))}
                    />
                    <Field
                      label="℗ line"
                      help="metadata.field.pLine"
                      placeholder="℗ 2026 Some Label"
                      value={form.pLine}
                      onChange={(v) => editForm((f) => ({ ...f, pLine: v }))}
                    />
                    <Field
                      label="© line"
                      help="metadata.field.cLine"
                      placeholder="© 2026 Some Label"
                      value={form.cLine}
                      onChange={(v) => editForm((f) => ({ ...f, cLine: v }))}
                    />
                    <LyricsField
                      value={form.lyrics}
                      onChange={(v) => editForm((f) => ({ ...f, lyrics: v }))}
                    />
                    {/* A Yes/No that starts unanswered, replacing a checkbox that
                        could not say "never asked" and so saved false for
                        everyone. The distribution check refuses a rollout
                        whose flag was never set. */}
                    <fieldset className="sm:col-span-2">
                      {/* TODO(copy): the brief gives no text for this question or its answers. */}
                      <legend className="text-sm text-content-secondary">
                        Does this song have explicit content (swearing or adult themes)?
                      </legend>
                      <div className="mt-1 flex items-center gap-4">
                        {(
                          [
                            [true, 'Yes'],
                            [false, 'No'],
                          ] as const
                        ).map(([value, label]) => (
                          <label
                            key={label}
                            className="flex min-h-11 cursor-pointer items-center gap-2 pr-3 text-sm text-content-secondary"
                          >
                            <input
                              type="radio"
                              name={`${explicitGroupName}-explicit`}
                              id={value ? metadataFieldElementId('explicit') : undefined}
                              checked={form.explicit === value}
                              onChange={() => editForm((f) => ({ ...f, explicit: value }))}
                              className="h-4 w-4 accent-brand"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
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
              id={metadataStepElementId('credits')}
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
                  <span
                    className={`text-[11px] ${
                      isLinkClosed
                        ? 'text-status-warning'
                        : link
                          ? 'text-brand'
                          : 'text-content-tertiary'
                    }`}
                  >
                    {isLinkClosed ? 'Link is closed' : link ? 'Link is live' : 'No link yet'}
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
                {/* Four sentences until 2026-09-08, and the worst in the file.
                    One stays visible (what to do with the link); who fills it
                    in and the no-account part moved into the pullout. */}
                <p className="text-sm text-content-secondary">
                  Copy the link and send it to anyone who worked on this song.{' '}
                  <HelpTip helpKey="metadata.step.credits" className="align-text-bottom" />
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
                          onClick={() => void handleToggleClosed(isLinkClosed ? 'reopen' : 'close')}
                          disabled={isMutatingLink}
                          className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isMutatingLink ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isLinkClosed ? (
                            <LockOpen className="h-3.5 w-3.5" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" />
                          )}
                          {isLinkClosed ? 'Reopen link' : 'Close link'}
                        </button>
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
                    {/* TRIMMED, NOT PULLED (2026-09-08). Three sentences per
                        branch became two. This one deliberately does NOT move
                        behind a pullout, unlike the field hints above: it is the
                        difference between two actions a person is about to take,
                        one of which kills a link that may already be in
                        somebody's inbox. A choice with a consequence stays on
                        screen. */}
                    <p className="mt-3 text-xs text-content-tertiary">
                      {isLinkClosed
                        ? 'This link is closed. Tap Reopen link and it starts taking answers again.'
                        : 'Close link stops new answers without breaking the link. Regenerate makes a new one, and the old stops working right away.'}
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
              id={metadataStepElementId('answers')}
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
                      ? 'Nothing yet. Answers show up here on their own.'
                      : 'Create the link in step 2 first, then share it.'}{' '}
                    {/* Only in the empty state, deliberately: once answers are
                        on screen, what the list holds is self-evident and the
                        pullout would be explaining something the user can
                        already read. */}
                    <HelpTip helpKey="metadata.step.answers" className="align-text-bottom" />
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

                    {/* Sits above the list rather than in the card header: it
                        acts on ALL the answers, and the header is a toggle, so a
                        button in there would fight the tap that opens the card. */}
                    <div className="mt-4 flex">
                      <button
                        type="button"
                        onClick={() => void handleExportCsv()}
                        disabled={isExporting}
                        className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-primary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isExporting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        {isExporting ? 'Building…' : 'Download as spreadsheet'}
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {submissions.map((submission) => (
                        <SubmissionCard
                          key={submission.id}
                          submission={submission}
                          isDeleting={deletingId === submission.id}
                          onDelete={() => void handleDeleteSubmission(submission.id, submission.legalName)}
                        />
                      ))}
                    </div>
                    <CreditClaimInvites releaseId={releaseId} refreshKey={submissions.length} />
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
  help,
  fieldKey,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  labelAction?: React.ReactNode;
  /** The explanation of what this field wants, offered behind a pullout beside
   * the label rather than printed under the input (founder ask, 2026-09-08).
   *
   * Nine fields each printing a sentence of grey text under a two-column grid
   * was the wall this replaced: the explanations were good, and having all nine
   * on screen at once meant none of them got read.
   *
   * SIGHTED USERS GET THE PULLOUT; SCREEN READERS STILL GET THE SENTENCE. The
   * same text renders as an `sr-only` paragraph wired to the input with
   * aria-describedby, exactly as the old visible hint was — moving an
   * explanation behind a hover would otherwise have taken it away entirely from
   * the people who cannot see the icon. Both read from one HELP_COPY entry, so
   * they cannot drift. */
  help?: HelpKey;
  /** Gives the input a stable id (`metadata-field-<key>`) so a Fix button from
   * the distribution check can land on it. Without one the id is generated. */
  fieldKey?: MetadataFixField;
}) {
  const generatedId = useId();
  const inputId = fieldKey ? metadataFieldElementId(fieldKey) : generatedId;
  const hintId = `${inputId}-hint`;
  const helpText = help ? HELP_COPY[help].text : null;
  const input = (
    <input
      id={inputId}
      type="text"
      value={value}
      placeholder={placeholder}
      aria-describedby={helpText ? hintId : undefined}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1 w-full border border-stroke-control bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
    />
  );
  const srHint = helpText ? (
    <p id={hintId} className="sr-only">
      {helpText}
    </p>
  ) : null;

  // A <button> must not nest inside a <label>, or activating it would also
  // activate the labelled input — so any field carrying a pullout or an action
  // uses an explicit <label htmlFor> in a row instead of a wrapping label. The
  // pullout counts as a button, which is why this is now the common case
  // rather than labelAction's special one.
  if (help || labelAction) {
    return (
      <div className="block text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <label htmlFor={inputId} className="truncate text-xs text-content-tertiary">
              {label}
            </label>
            {help ? <HelpTip helpKey={help} /> : null}
          </span>
          {labelAction}
        </div>
        {input}
        {srHint}
      </div>
    );
  }

  return (
    <div className="block text-sm">
      <label htmlFor={inputId} className="text-xs text-content-tertiary">
        {label}
      </label>
      {input}
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
  const formatDate = (value: string): string =>
    new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(value)
    );

  const submittedDate = submission.createdAt ? formatDate(submission.createdAt) : '';
  // Resubmitting with the same email replaces the earlier answer, keeping
  // created_at — so an updated row needs to say when it last changed, or the
  // owner has no way to tell a correction from the original. A minute of slack
  // absorbs the trigger writing updated_at a hair after created_at on insert.
  const updatedDate =
    submission.updatedAt &&
    submission.createdAt &&
    new Date(submission.updatedAt).getTime() - new Date(submission.createdAt).getTime() > 60_000
      ? formatDate(submission.updatedAt)
      : '';

  // Every field the form collects is shown: country and the publisher's IPI
  // were captured from the start and rendered nowhere, so an owner doing a
  // distributor handoff had to guess they were missing.
  const contactLine = [submission.email, submission.phone, submission.country]
    .filter(Boolean)
    .join(' · ');
  const publishingLine = [
    submission.proAffiliation && `PRO: ${submission.proAffiliation}`,
    submission.ipiNumber && `IPI: ${submission.ipiNumber}`,
    submission.publisherName && `Publisher: ${submission.publisherName}`,
    submission.publisherIpi && `Publisher IPI: ${submission.publisherIpi}`,
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
          {updatedDate ? ` · updated ${updatedDate}` : ''}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The song's words (URG-322, 2026-10-16). One plain textarea across both
 * columns: the handoff to the distributor counts the metadata as ready only
 * once lyrics are in, and its Fix button lands here (`metadata-field-lyrics`).
 */
function LyricsField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputId = metadataFieldElementId('lyrics');
  return (
    <div className="block text-sm sm:col-span-2">
      <label htmlFor={inputId} className="text-xs text-content-tertiary">
        Lyrics
      </label>
      <textarea
        id={inputId}
        value={value}
        rows={6}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full resize-y border border-stroke-control bg-bg-elevated px-3 py-2 text-sm leading-relaxed text-content-primary outline-none focus:border-brand"
      />
    </div>
  );
}
