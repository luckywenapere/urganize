'use client';

import { Loader2, Music, Upload, X } from 'lucide-react';
import { formatFileSize } from '@/lib/asset-constants';
import { SONG_FILE_ACCEPT, SONG_FORMATS_LABEL, SONG_MAX_BYTES } from '@/lib/song';
import { useSongUpload } from '@/components/releases/useSongUpload';
import type { ReleaseSong } from '@/types/song';

type ChappiSongUploadCardProps = {
  releaseId: string;
  /** For the headline, so the card names what it is about to attach to. */
  releaseTitle: string;
  onUploaded: (song: ReleaseSong) => void;
  onDismiss: () => void;
};

/**
 * Uploading a song from inside the conversation.
 *
 * This is the answer to "why can't the assistant just take the file": a model
 * turn is text, so nothing can hand a tool a file, and `input.click()` only
 * opens a dialog inside a user gesture — which a tool result, arriving over the
 * network, is not. So the assistant resolves the release and drops this card,
 * and the user's click on it is the gesture that opens the picker. From there
 * the bytes go browser → Supabase Storage through the same three-step signed
 * URL flow the workspace's Song scene uses (lib/song.ts). The file never passes
 * through the model or through one of our serverless functions.
 *
 * Inline in the transcript rather than a modal, for the reasons
 * ChappiConfirmationCard already documents: it belongs to the turn that
 * produced it, it has to survive alongside the messages above it, and the
 * surfaces the assistant lives in sit deliberately below the modal tier.
 *
 * Unlike that card, nothing here is destructive — uploading adds a version, it
 * never replaces one — so this is a plain surface, not the red permission
 * treatment.
 */
export function ChappiSongUploadCard({
  releaseId,
  releaseTitle,
  onUploaded,
  onDismiss,
}: ChappiSongUploadCardProps) {
  const upload = useSongUpload({
    releaseId,
    accept: SONG_FILE_ACCEPT,
    onUploaded,
  });

  return (
    <div
      role="group"
      aria-label={`Upload the song for ${releaseTitle}`}
      className="mt-4 border border-stroke-default bg-bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <Music className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold leading-snug text-content-primary">
            Choose the song for {releaseTitle}
          </p>
          <p className="mt-1.5 text-sm leading-6 text-content-secondary">
            {SONG_FORMATS_LABEL}, up to {formatFileSize(SONG_MAX_BYTES)}. It uploads straight from
            this device — only your team can hear it.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={upload.isUploading}
          aria-label="Dismiss the upload card"
          className="motion-focus -mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center text-content-tertiary transition-colors hover:text-content-primary disabled:opacity-40"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {upload.error ? (
        <p className="mt-3 text-xs text-status-error" role="alert">
          {upload.error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {/* Hidden input + real button: the button click is the user gesture the
            picker needs, and the hook owns the input ref so both this card and
            the Song scene drive one implementation. */}
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
              Choose file
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
