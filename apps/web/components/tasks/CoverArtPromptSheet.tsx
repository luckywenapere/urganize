/* eslint-disable @next/next/no-img-element */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { Image as ImageIcon, Loader2, Upload, X } from '@/components/icons';

import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { formatFileSize } from '@/lib/asset-constants';
import { COVER_ART_FILE_ACCEPT, COVER_ART_MAX_BYTES } from '@/lib/cover-art-upload';
import { DSP_REQUIREMENT_LABEL } from '@/lib/cover-art-dsp';
import { useCoverArtUpload } from '@/components/releases/useCoverArtUpload';
import { useSceneData } from '@/components/releases/useSceneData';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import { useTaskStore, type CoverArtPromptState } from '@/stores/useTaskStore';
import type { ReleaseCoverArt } from '@/types/cover-art';
import { CoverArtDspNote } from '@/components/releases/CoverArtDspNote';

/**
 * "You just ticked off the cover art. Want to put the file on the release?"
 *
 * Fires when a cover-art playbook step is completed (lib/cover-art-tasks.ts
 * decides which), because that is the one moment the manager is certain to
 * have the image in front of them. Uploading happens right here, inline: the
 * whole point is that saying yes costs one tap, not a navigation.
 *
 * Mounted once by TaskUIProvider, after the task detail pop-up, so a
 * completion triggered from inside that pop-up stacks the sheet above it. No
 * portal: the provider's subtree already hosts the z-[170] modal tier.
 *
 * Rules this surface must keep, all shared with TaskOutcomeSheet:
 * - It never blocks or delays completion. The store writes its prompt slot in
 *   the same synchronous frame as the done flip.
 * - Skipping is one tap (X, backdrop, swipe down), records nothing, and never
 *   reopens the task. Skipping is a real answer, not a failure: the Cover art
 *   scene is still there, which is what the secondary copy says.
 * - No Escape handler on purpose: the task detail pop-up owns Escape, and a
 *   second window listener would close both surfaces on one keypress.
 */
export function CoverArtPromptSheet() {
  const prompt = useTaskStore((state) => state.coverArtPrompt);
  const dismiss = useTaskStore((state) => state.dismissCoverArtPrompt);

  if (!prompt) return null;

  // The tick in the key remounts the body for every completion, so a rapid
  // complete, reopen, complete never inherits the previous sheet's state.
  return (
    <CoverArtPromptBody key={`${prompt.taskId}:${prompt.tick}`} prompt={prompt} onDismiss={dismiss} />
  );
}

const SWIPE_DISMISS_PX = 80;
const DONE_VISIBLE_MS = 1400;

function CoverArtPromptBody({
  prompt,
  onDismiss,
}: {
  prompt: CoverArtPromptState;
  onDismiss: () => void;
}) {
  const [isDone, setIsDone] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(true, panelRef);

  // Whether the release already has cover art is resolved HERE rather than
  // guessed in the store: `Release.coverArtUrl` falls back to the workspace
  // logo, so it cannot answer "does this release have real artwork". A warm
  // scene cache makes this instant; otherwise the sheet opens on the shared
  // ask and settles into the right variant a moment later.
  const { data, isLoading } = useSceneData(prompt.releaseId, 'coverart');
  const setScene = useSceneDataStore((state) => state.setScene);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);

  const existing = data?.coverArt ?? null;

  useEffect(() => lockBodyScroll(), []);

  useEffect(() => {
    if (!isDone) return;
    const timer = setTimeout(onDismiss, DONE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [isDone, onDismiss]);

  const handleUploaded = useCallback(
    (uploaded: ReleaseCoverArt) => {
      // Write through to the same cache the Cover art scene reads, and refresh
      // the catalog so the release card shows the new image without a reload
      // — exactly what CoverArtSection does on its own successful upload.
      setScene(prompt.releaseId, 'coverart', { coverArt: uploaded });
      void loadCommandCenter({ force: true });
      setIsDone(true);
    },
    [loadCommandCenter, prompt.releaseId, setScene]
  );

  const upload = useCoverArtUpload({
    releaseId: prompt.releaseId,
    accept: COVER_ART_FILE_ACCEPT,
    onUploaded: handleUploaded,
  });

  const handleTouchStart = (event: React.TouchEvent) => {
    dragStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - dragStartY.current;
    setDragOffset(delta > 0 ? delta : 0);
  };

  const handleTouchEnd = () => {
    dragStartY.current = null;
    if (dragOffset > SWIPE_DISMISS_PX) {
      onDismiss();
      return;
    }
    setDragOffset(0);
  };

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Add the cover art"
        /* Reuses TaskOutcomeSheet's enter keyframe rather than adding a second
           one for the same motion (app/globals.css). */
        className="task-outcome-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-stroke-strong bg-bg-surface shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] sm:max-w-md sm:rounded-2xl sm:border"
        style={
          dragOffset > 0
            ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
            : { transform: 'translateY(0)', transition: 'transform 180ms var(--motion-out)' }
        }
      >
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="shrink-0 px-5 pt-3 sm:px-6"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stroke-strong sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Cover art
            </p>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close"
              className="motion-focus motion-press grid h-9 w-9 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 sm:px-6 sm:pb-6">
          {isDone ? (
            <div>
              <h2 className="font-display text-xl text-content-primary">On the rollout.</h2>
              <p className="mt-1 text-sm text-content-secondary">
                It shows on the rollout card, the kit link and anywhere else the rollout appears.
              </p>
            </div>
          ) : (
            <div>
              <h2 className="font-display text-xl text-content-primary">
                {existing ? 'Is this the final artwork?' : 'Add the cover art'}
              </h2>
              <p className="mt-1 text-sm text-content-secondary">
                {existing
                  ? 'This rollout already has cover art. Upload the new file to replace it.'
                  : 'You just marked this done. Put the file on the rollout while you have it open.'}
              </p>

              <div className="mt-4 flex items-start gap-3">
                <div className="aspect-square w-16 shrink-0 overflow-hidden rounded-lg border border-stroke-default bg-bg-elevated">
                  {isLoading ? (
                    <div className="h-full w-full animate-pulse bg-bg-elevated" />
                  ) : existing?.downloadUrl ? (
                    <img
                      src={existing.downloadUrl}
                      alt="Current cover art"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-content-tertiary">
                      <ImageIcon className="h-4 w-4" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <p className="min-w-0 flex-1 text-xs text-content-tertiary">
                  {DSP_REQUIREMENT_LABEL}, up to {formatFileSize(COVER_ART_MAX_BYTES)}. Anything
                  smaller still works here, it just is not ready for the distributor yet.
                </p>
              </div>

              <input className="sr-only" {...upload.inputProps} />
              <button
                type="button"
                onClick={upload.openPicker}
                disabled={upload.isUploading}
                className="motion-focus motion-press mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-brand/25 bg-brand text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {upload.isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    {existing ? 'Choose the new file' : 'Choose the file'}
                  </>
                )}
              </button>

              {upload.retryFile ? (
                <button
                  type="button"
                  onClick={upload.retry}
                  disabled={upload.isUploading}
                  className="motion-focus motion-press mt-2 inline-flex h-11 w-full items-center justify-center rounded-full border border-stroke-default bg-bg-elevated text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                >
                  Retry
                </button>
              ) : null}

              <button
                type="button"
                onClick={onDismiss}
                className="motion-focus mt-3 w-full text-center text-xs font-semibold text-content-secondary hover:text-content-primary"
              >
                I&apos;ll do it later
              </button>
              <p className="mt-1.5 text-center text-[11px] text-content-tertiary">
                You can add it any time from Cover art on this rollout.
              </p>

              {upload.queued ? (
                <p className="mt-3 text-xs text-content-secondary" role="status">
                  You&rsquo;re offline. This will upload when you&rsquo;re back online.
                </p>
              ) : upload.error ? (
                <p className="mt-3 text-xs text-status-error" role="alert">
                  {upload.error}
                </p>
              ) : (
                <CoverArtDspNote grade={upload.grade} className="mt-3" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
