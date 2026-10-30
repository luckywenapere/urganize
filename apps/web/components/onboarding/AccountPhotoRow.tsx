'use client';

// "Your photo" on Set up your team (mocks v3, board A; founder approved
// 2026-10-30). Optional: Continue never waits on it. The upload lives in
// accountPhotoUploadStore, so tapping Continue mid-upload does not lose it;
// the top bar face swaps to the photo when it lands. No Google suggestion
// here, that is on the invitee step only. Behind NEXT_PUBLIC_FEATURE_PROFILE_PHOTO.

import { PhotoCropDialog } from '@/components/shared/PhotoCropDialog';
import { usePhotoUpload } from '@/components/shared/usePhotoUpload';
import { ACCEPTED_PHOTO_TYPES, AccountPhotoFace } from '@/components/shared/AccountPhotoParts';
import { useMyPhotoUrl } from '@/components/shared/AccountPhoto';
import { isAccountPhotoEnabled } from '@/lib/account-photo';
import { useAuthStore } from '@/lib/auth-store';
import { accountPhotoUploadOptions } from '@/stores/useAccountPhotoStore';

const pillClass =
  'ml-auto inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full border border-stroke-control px-3 text-[13.5px] font-semibold text-content-primary md:px-3.5 md:text-sm';

export function AccountPhotoRow({ name }: { name: string }) {
  const userId = useAuthStore((state) => state.user?.id ?? '');
  if (!isAccountPhotoEnabled() || !userId) return null;
  return <Row userId={userId} name={name} />;
}

function Row({ userId, name }: { userId: string; name: string }) {
  const { bindInput, ...photo } = usePhotoUpload(accountPhotoUploadOptions(userId, 'onboarding_team'));
  const saved = useMyPhotoUrl();

  const state = photo.uploading ? 'uploading' : photo.failed ? 'error' : saved ? 'done' : 'empty';
  const face = (
    <AccountPhotoFace name={name} size={44} previewUrl={photo.previewUrl} uploading={photo.uploading} badgeSize={20} />
  );

  return (
    <div className="mt-[18px] rounded-2xl border border-stroke-control bg-bg-surface px-3 py-2.5 md:mt-6 md:max-w-[440px] md:px-3.5 md:py-3">
      {state === 'uploading' ? (
        <div className="flex min-h-14 items-center gap-2.5 md:gap-3" role="status" aria-live="polite">
          {face}
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-content-primary">Uploading.</span>
            <span className="block text-[12.5px] text-content-secondary md:text-[13px]">This can take a minute on slow data.</span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={state === 'error' ? photo.retry : photo.pick}
          disabled={photo.busy}
          aria-label={
            state === 'error'
              ? 'Your photo did not upload. Try again'
              : state === 'done'
                ? 'Change your photo'
                : 'Add your photo'
          }
          className="flex min-h-14 w-full items-center gap-2.5 text-left disabled:opacity-60 md:gap-3"
        >
          {face}
          <span className="min-w-0" aria-hidden="true">
            {state === 'error' ? (
              <>
                <span className="block text-[15px] font-semibold text-status-error">
                  Your photo did not upload.
                </span>
                <span className="block text-[12.5px] text-content-secondary md:text-[13px]">Try again, or carry on without it.</span>
              </>
            ) : (
              <>
                <span className="block text-[15px] font-semibold text-content-primary">Your photo</span>
                <span className="block truncate text-[12.5px] text-content-secondary md:text-[13px]">
                  {state === 'done' ? 'Your team will see this.' : "So your team knows it's you."}
                </span>
              </>
            )}
          </span>
          <span className={pillClass} aria-hidden="true">
            {state === 'error' ? 'Try again' : state === 'done' ? 'Change' : 'Add photo'}
          </span>
        </button>
      )}
      {/* Screen readers hear the outcome; the row itself is one button. */}
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'error' ? 'Your photo did not upload.' : ''}
      </span>
      {photo.error && !photo.failed ? (
        <p role="alert" className="mt-1 text-[13px] text-status-error">
          {photo.error}
        </p>
      ) : null}
      <input ref={bindInput} type="file" accept={ACCEPTED_PHOTO_TYPES} className="hidden" onChange={photo.onFileChange} />
      {photo.cropping ? (
        <PhotoCropDialog file={photo.cropping} name={name} onCancel={photo.cancelCrop} onConfirm={photo.confirmCrop} />
      ) : null}
    </div>
  );
}
