'use client';

// "Your photo" at the top of Settings, Profile (mocks v3, board D). Saves the
// moment the crop is confirmed, on its own, outside the block the form's Save
// owns. Behind NEXT_PUBLIC_FEATURE_PROFILE_PHOTO.

import { useState } from 'react';
import { PhotoCropDialog } from '@/components/shared/PhotoCropDialog';
import { usePhotoUpload } from '@/components/shared/usePhotoUpload';
import { ACCEPTED_PHOTO_TYPES, AccountPhotoFace } from '@/components/shared/AccountPhotoParts';
import { useMyPhotoUrl } from '@/components/shared/AccountPhoto';
import { isAccountPhotoEnabled } from '@/lib/account-photo';
import { accountPhotoUploadOptions } from '@/stores/useAccountPhotoStore';
import { feedbackErrorClass } from './feedback';

const pill =
  'motion-press inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors disabled:opacity-60';

export function AccountPhotoSettings({ userId, name }: { userId: string; name: string }) {
  if (!isAccountPhotoEnabled() || !userId) return null;
  return <Block userId={userId} name={name} />;
}

function Block({ userId, name }: { userId: string; name: string }) {
  const [saved, setSaved] = useState(false);
  const base = accountPhotoUploadOptions(userId, 'settings');
  const { bindInput, ...photo } = usePhotoUpload({
    ...base,
    onSaved: (url, info) => {
      base.onSaved(url, info);
      setSaved(!info.removed);
    },
  });
  const photoUrl = useMyPhotoUrl();
  const hasPhoto = Boolean(photoUrl);

  return (
    <div className="mb-5 flex items-center gap-[18px] border-b border-stroke-default pb-5">
      <AccountPhotoFace
        name={name}
        size={72}
        previewUrl={photo.previewUrl}
        uploading={photo.uploading}
        badgeSize={26}
        tone="brand"
      />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-content-primary">Your photo</p>
        {hasPhoto ? null : <p className="text-[13px] text-content-secondary">So your team knows it&apos;s you.</p>}
        <div className="mt-2 flex flex-wrap items-center gap-4">
          {hasPhoto ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setSaved(false);
                  photo.pick();
                }}
                disabled={photo.busy}
                className={`${pill} border-stroke-control text-content-primary hover:bg-bg-hover`}
              >
                Change photo
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaved(false);
                  void photo.remove();
                }}
                disabled={photo.busy}
                className="motion-focus min-h-10 text-sm text-content-secondary underline decoration-content-tertiary underline-offset-[3px] hover:text-content-primary disabled:opacity-60"
              >
                Remove
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSaved(false);
                photo.pick();
              }}
              disabled={photo.busy}
              className={`${pill} border-brand bg-brand text-content-inverse hover:bg-brand-hover`}
            >
              Add photo
            </button>
          )}
        </div>
        <div aria-live="polite">
          {photo.uploading ? (
            <p className="mt-1.5 text-[13px] text-content-secondary">Uploading. This can take a minute on slow data.</p>
          ) : photo.failed ? (
            <p role="alert" className={`mt-1.5 ${feedbackErrorClass}`}>
              Your photo did not upload.{' '}
              <button type="button" onClick={photo.retry} className="underline underline-offset-[3px]">
                Try again
              </button>
            </p>
          ) : photo.error ? (
            <p role="alert" className={`mt-1.5 ${feedbackErrorClass}`}>
              {photo.error}
            </p>
          ) : saved && hasPhoto ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-brand">Saved</p>
          ) : null}
        </div>
      </div>
      <input ref={bindInput} type="file" accept={ACCEPTED_PHOTO_TYPES} className="hidden" onChange={photo.onFileChange} />
      {photo.cropping ? (
        <PhotoCropDialog file={photo.cropping} name={name} onCancel={photo.cancelCrop} onConfirm={photo.confirmCrop} />
      ) : null}
    </div>
  );
}
