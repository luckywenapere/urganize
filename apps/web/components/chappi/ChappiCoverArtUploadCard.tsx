'use client';

import { ImageIcon, Loader2, Upload, X } from '@/components/icons';
import { formatFileSize } from '@/lib/asset-constants';
import { DSP_MIN_EDGE } from '@/lib/cover-art-dsp';
import {
  COVER_ART_FILE_ACCEPT,
  COVER_ART_FORMATS_LABEL,
  COVER_ART_MAX_BYTES,
} from '@/lib/cover-art-upload';
import { useCoverArtUpload } from '@/components/releases/useCoverArtUpload';
import type { ReleaseCoverArt } from '@/types/cover-art';

type ChappiCoverArtUploadCardProps = {
  releaseId: string;
  /** For the headline, so the card names what it is about to attach to. */
  releaseTitle: string;
  onUploaded: (coverArt: ReleaseCoverArt) => void;
  onDismiss: () => void;
};

/**
 * Choosing cover art from inside the conversation.
 *
 * ChappiSongUploadCard's twin, and for the same reason: a model turn is text,
 * so nothing can hand a tool a file, and the picker only opens inside a user
 * gesture. The assistant resolves the release and drops this card; the click
 * on it is the gesture. Read that card's header for the full argument.
 *
 * TWO THINGS DIFFER FROM THE SONG CARD, both worth keeping:
 *
 * Uploading REPLACES the current artwork, where a song upload adds a version
 * and destroys nothing. A release has exactly one identity image. So this card
 * says so plainly rather than leaving it to be discovered.
 *
 * The hook grades the file against what music stores require before it goes
 * anywhere, and a below-spec image WARNS rather than refusing — a manager with
 * only the designer's draft still needs it on the release card today. So the
 * grade is surfaced here as guidance, not as an error.
 */
export function ChappiCoverArtUploadCard({
  releaseId,
  releaseTitle,
  onUploaded,
  onDismiss,
}: ChappiCoverArtUploadCardProps) {
  const upload = useCoverArtUpload({
    releaseId,
    accept: COVER_ART_FILE_ACCEPT,
    onUploaded,
  });

  return (
    <div
      role="group"
      aria-label={`Choose cover art for ${releaseTitle}`}
      className="mt-4 border border-stroke-default bg-bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold leading-snug text-content-primary">
            Choose cover art for {releaseTitle}
          </p>
          <p className="mt-1.5 text-sm leading-6 text-content-secondary">
            Square, at least {DSP_MIN_EDGE} x {DSP_MIN_EDGE}, {COVER_ART_FORMATS_LABEL}, up to{' '}
            {formatFileSize(COVER_ART_MAX_BYTES)}. This replaces the artwork on the release.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={upload.isUploading}
          aria-label="Dismiss the cover art card"
          className="motion-focus -mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center text-content-tertiary transition-colors hover:text-content-primary disabled:opacity-40"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {upload.queued ? (
        <p className="mt-3 text-xs text-content-secondary" role="status">
          You&rsquo;re offline — this will upload when you&rsquo;re back online.
        </p>
      ) : null}

      {/* Guidance, not a refusal: a below-spec image still uploads, because the
          designer's draft is often all a manager has on the day.
          Only a 'warning' is shown here — the hook surfaces a 'blocked' grade
          as `error` too, and printing both would say the same thing twice. */}
      {upload.grade && upload.grade.verdict === 'warning' ? (
        <p className="mt-3 text-xs text-content-secondary" role="status">
          {upload.grade.headline}
          {upload.grade.detail ? ` ${upload.grade.detail}` : ''}
        </p>
      ) : null}

      {upload.error ? (
        <p className="mt-3 text-xs text-status-error" role="alert">
          {upload.error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {/* Hidden input + real button: the button click is the user gesture the
            picker needs, and the hook owns the input ref so this card and the
            Cover art scene drive one implementation. */}
        <input className="sr-only" {...upload.inputProps} />
        <button
          type="button"
          onClick={upload.openPicker}
          disabled={upload.isUploading}
          className="motion-focus motion-press inline-flex h-9 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {upload.isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Choose image
            </>
          )}
        </button>

        {upload.retryFile ? (
          <button
            type="button"
            onClick={upload.retry}
            disabled={upload.isUploading}
            className="motion-focus motion-press inline-flex h-9 items-center border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
