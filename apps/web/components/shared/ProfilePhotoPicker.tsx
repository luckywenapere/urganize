'use client';

import { Camera, Loader2, Trash2 } from '@/components/icons';
import { captureAnalyticsEvent } from '@/lib/analytics';
import type { UploadSurface } from '@/lib/upload-failure-report';
import { PROFILE_PHOTO_MIME_TYPES } from '@/lib/profile-photo';
import { ProfileFace } from './ProfileFace';
import { PhotoCropDialog } from './PhotoCropDialog';
import { usePhotoUpload } from './usePhotoUpload';

/**
 * A face you can tap to change. Used on the Artists list, the artist page and
 * the directory record in Settings (2026-10-11).
 *
 * THE SLOT IS ALWAYS THERE. No photo shows the gradient + initials with a small
 * camera badge, so the empty state reads as "add one" rather than as a broken
 * image. Tapping opens the file picker; the chosen photo is downsized on the
 * device, then framed in a square crop step (PhotoCropDialog) so the face, not
 * the background, is what every avatar shows.
 *
 * The upload is the three-step flow the workspace logo and curator photo use:
 * sign (POST `signUrl`) → PUT the bytes to storage → `save(path)`. A failure
 * says which step broke and carries a pasteable code, same as those. The
 * mechanics live in usePhotoUpload (2026-10-30), which the account photo
 * surfaces share.
 */

type Props = {
  name: string;
  photoUrl: string | null | undefined;
  size: number;
  square?: boolean;
  /** POST endpoint that returns { upload_url, storage_path }. */
  signUrl: string;
  /** Persist the path (or null to remove); resolves to the new signed URL. */
  save: (photoPath: string | null) => Promise<string | null>;
  onChange: (photoUrl: string | null) => void;
  surface: UploadSurface;
  /** Show "Change photo · Remove" under the face. Off for compact list rows. */
  showActions?: boolean;
  /** No text row: tapping the face changes it, and a small trash button on
   *  the photo's bottom-right corner, shown on hover, removes it (artist
   *  page, 2026-10-15). */
  overlayRemove?: boolean;
  /** A small neutral camera chip instead of the green badge, for a page where
   *  the badge would be the loudest thing on it (artist page, #866). */
  quietBadge?: boolean;
  className?: string;
};

export function ProfilePhotoPicker({
  name,
  photoUrl,
  size,
  square = false,
  signUrl,
  save,
  onChange,
  surface,
  showActions = false,
  overlayRemove = false,
  quietBadge = false,
  className = '',
}: Props) {
  const { bindInput, ...photo } = usePhotoUpload({
    signUrl,
    save,
    surface,
    onSaved: (url, { removed }) => {
      onChange(url);
      if (!removed) {
        captureAnalyticsEvent({
          name: 'profile_photo_saved',
          properties: { surface, replaced: Boolean(photoUrl) },
        });
      }
    },
  });
  const { busy } = photo;

  const badge = quietBadge ? 28 : Math.max(18, Math.round(size * 0.36));

  return (
    <div className={`inline-flex flex-col items-start ${className}`}>
      <div className="group/photo relative">
      <button
        type="button"
        onClick={(event) => {
          // Rows wrap their content in links; the face must never navigate.
          event.preventDefault();
          event.stopPropagation();
          photo.pick();
        }}
        disabled={busy}
        aria-label={photoUrl ? `Change ${name}'s photo` : `Add a photo of ${name}`}
        title={photoUrl ? 'Change photo' : 'Add photo'}
        className={`motion-focus group relative shrink-0 ${square ? 'rounded-2xl' : 'rounded-full'}`}
        style={{ width: size, height: size }}
      >
        <ProfileFace name={name} photoUrl={photoUrl} size={size} square={square} />
        {/* Hover/focus veil on desktop; the badge below is the touch affordance. */}
        <span
          aria-hidden
          className={`absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${
            square ? 'rounded-2xl' : 'rounded-full'
          } ${busy ? 'opacity-100' : ''}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </span>
        {!photoUrl && !busy ? (
          <span
            aria-hidden
            className={
              quietBadge
                ? 'absolute -bottom-1 -right-1 flex items-center justify-center rounded-full border border-stroke-strong bg-bg-surface text-content-secondary'
                : 'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-bg-surface bg-brand text-content-inverse'
            }
            style={{ width: badge, height: badge }}
          >
            <Camera style={{ width: badge * (quietBadge ? 0.5 : 0.55), height: badge * (quietBadge ? 0.5 : 0.55) }} />
          </span>
        ) : null}
      </button>
      {overlayRemove && photoUrl && !busy ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void photo.remove();
          }}
          aria-label={`Remove ${name}'s photo`}
          title="Remove photo"
          // Shown on hover or keyboard focus only (founder, 2026-10-15); a
          // touch screen has no hover, so it stays visible there.
          className="motion-focus motion-press absolute bottom-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white/85 opacity-0 backdrop-blur-sm transition-[opacity,background-color,color] hover:bg-black/80 hover:text-status-error focus-visible:bg-black/80 focus-visible:text-status-error focus-visible:opacity-100 group-hover/photo:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      </div>

      <input
        ref={bindInput}
        type="file"
        accept={PROFILE_PHOTO_MIME_TYPES.join(',')}
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={photo.onFileChange}
      />

      {showActions ? (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={photo.pick}
            disabled={busy}
            className="motion-focus min-h-8 font-semibold text-brand hover:underline disabled:opacity-60"
          >
            {photoUrl ? 'Change photo' : 'Add photo'}
          </button>
          {photoUrl ? (
            <button
              type="button"
              onClick={() => void photo.remove()}
              disabled={busy}
              className="motion-focus min-h-8 text-content-secondary hover:underline disabled:opacity-60"
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}

      {photo.cropping ? (
        <PhotoCropDialog file={photo.cropping} name={name} onCancel={photo.cancelCrop} onConfirm={photo.confirmCrop} />
      ) : null}

      {photo.error ? (
        <p role="alert" className="mt-1 max-w-[16rem] text-xs text-status-error">
          {photo.error}
        </p>
      ) : null}
    </div>
  );
}
