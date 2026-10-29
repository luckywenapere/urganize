'use client';

import { useEffect } from 'react';
import { Loader2, Pencil } from '@/components/icons';
import { ThumbImage } from '@/components/shared/ThumbImage';
import { COVER_ART_FILE_ACCEPT } from '@/lib/cover-art-upload';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import { useCoverArtUpload } from '@/components/releases/useCoverArtUpload';
import type { ReleaseCoverArt } from '@/types/cover-art';

/**
 * A rollout's cover on the artist page, with a pencil that shows on hover
 * (founder, Oct 29, 2026, #847: cover art left the rollout menu). The pencil
 * opens the file picker straight away; the upload is the Cover art scene's
 * (useCoverArtUpload), with the same force-refresh after so every card showing
 * the cover updates. Screens with no hover keep the pencil visible.
 */
export function CoverThumbEditor({
  releaseId,
  title,
  coverUrl,
  coverThumbUrl,
  onToast,
}: {
  releaseId: string;
  title: string;
  coverUrl: string | null | undefined;
  coverThumbUrl: string | null | undefined;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
}) {
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const setScene = useSceneDataStore((state) => state.setScene);

  const upload = useCoverArtUpload({
    releaseId,
    accept: COVER_ART_FILE_ACCEPT,
    onUploaded: (uploaded: ReleaseCoverArt) => {
      setScene(releaseId, 'coverart', { coverArt: uploaded });
      onToast('Cover art updated.', 'success');
      void loadCommandCenter({ force: true });
    },
    onToast,
  });

  // A blocked file (wrong size or type) never uploads: say why once.
  const { error, isUploading, clearError } = upload;
  useEffect(() => {
    if (!error || isUploading) return;
    onToast(error, 'error');
    clearError();
  }, [error, isUploading, onToast, clearError]);

  return (
    <div className="group/cover relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-stroke-default bg-bg-elevated">
      <input {...upload.inputProps} className="sr-only" tabIndex={-1} aria-hidden="true" />
      {coverUrl ? (
        <ThumbImage src={coverThumbUrl ?? coverUrl} width={40} height={40} className="h-full w-full object-cover" />
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (isUploading) return;
          clearError();
          upload.openPicker();
        }}
        aria-label={coverUrl ? `Change cover art for ${title}` : `Add cover art for ${title}`}
        title={coverUrl ? 'Change cover art' : 'Add cover art'}
        className="motion-focus absolute inset-0 grid place-items-center bg-black/50 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover/cover:opacity-100 [@media(hover:none)]:bg-black/30 [@media(hover:none)]:opacity-100"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      {isUploading ? (
        <span className="absolute inset-0 grid place-items-center bg-black/60">
          <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}
