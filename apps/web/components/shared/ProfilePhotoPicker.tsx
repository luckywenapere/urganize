'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { captureAnalyticsEvent, createPostHogEvent } from '@/lib/analytics';
import { prepareAvatarImage } from '@/lib/downscale-image';
import {
  buildUploadFailureReport,
  formatUploadFailureCode,
  type UploadStep,
  type UploadSurface,
} from '@/lib/upload-failure-report';
import { PROFILE_PHOTO_MIME_TYPES } from '@/lib/profile-photo';
import { ProfileFace } from './ProfileFace';
import { PhotoCropDialog } from './PhotoCropDialog';

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
 * says which step broke and carries a pasteable code, same as those.
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
   *  the photo's bottom-left corner removes it (artist page, 2026-10-15). */
  overlayRemove?: boolean;
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
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cropping, setCropping] = useState<File | null>(null);

  const pick = () => {
    if (!busy) inputRef.current?.click();
  };

  // Shrink first (a phone original can be past what a browser will decode),
  // then hand it to the crop step. 2048px leaves room to zoom in sharply.
  const choose = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      const prepared = await prepareAvatarImage(file, 2048);
      if (!prepared) {
        setError('Could not read that image. Try a JPEG.');
        return;
      }
      setCropping(prepared.file);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  /** `body` is the cropped square, already small. */
  const upload = async (body: File) => {
    setError('');
    setBusy(true);
    let step: UploadStep = 1;
    let status: number | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to change the photo.');

      const signResponse = await fetch(signUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: body.name, mime_type: body.type, file_size: body.size }),
      });
      const signed = (await signResponse.json().catch(() => null)) as {
        upload_url?: string;
        storage_path?: string;
        error?: string;
      } | null;
      if (!signResponse.ok || !signed?.upload_url || !signed.storage_path) {
        status = signResponse.status;
        throw new Error(signed?.error || 'Could not start the upload.');
      }

      step = 2;
      const put = await fetch(signed.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': body.type },
        body,
      });
      if (!put.ok) {
        status = put.status;
        throw new Error('The upload did not finish.');
      }

      step = 3;
      onChange(await save(signed.storage_path));
      captureAnalyticsEvent({ name: 'profile_photo_saved', properties: { surface, replaced: Boolean(photoUrl) } });
    } catch (uploadError) {
      const code = formatUploadFailureCode({ surface, step, status });
      const detail = uploadError instanceof Error ? uploadError.message : 'Could not save the photo.';
      setError(`${detail} (${code})`);
      captureAnalyticsEvent(
        createPostHogEvent(
          'asset_upload_failed',
          buildUploadFailureReport({
            surface,
            step,
            status,
            message: uploadError instanceof Error ? uploadError.message : null,
          })
        )
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setError('');
    setBusy(true);
    try {
      onChange(await save(null));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  };

  const badge = Math.max(18, Math.round(size * 0.36));

  return (
    <div className={`inline-flex flex-col items-start ${className}`}>
      <div className="relative">
      <button
        type="button"
        onClick={(event) => {
          // Rows wrap their content in links; the face must never navigate.
          event.preventDefault();
          event.stopPropagation();
          pick();
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
            className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-bg-surface bg-brand text-content-inverse"
            style={{ width: badge, height: badge }}
          >
            <Camera style={{ width: badge * 0.55, height: badge * 0.55 }} />
          </span>
        ) : null}
      </button>
      {overlayRemove && photoUrl && !busy ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void remove();
          }}
          aria-label={`Remove ${name}'s photo`}
          title="Remove photo"
          className="motion-focus motion-press absolute bottom-1.5 left-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/75 hover:text-white"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={PROFILE_PHOTO_MIME_TYPES.join(',')}
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void choose(file);
        }}
      />

      {showActions ? (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={pick}
            disabled={busy}
            className="motion-focus min-h-8 font-semibold text-brand hover:underline disabled:opacity-60"
          >
            {photoUrl ? 'Change photo' : 'Add photo'}
          </button>
          {photoUrl ? (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="motion-focus min-h-8 text-content-secondary hover:underline disabled:opacity-60"
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}

      {cropping ? (
        <PhotoCropDialog
          file={cropping}
          name={name}
          onCancel={() => setCropping(null)}
          onConfirm={(cropped) => {
            setCropping(null);
            void upload(cropped);
          }}
        />
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 max-w-[16rem] text-xs text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
