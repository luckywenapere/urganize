'use client';

// "Add your photo" for an invited teammate (mocks v3, board B; founder
// approved 2026-10-30). Not a route: InviteAcceptPageClient (also /join/<code>)
// shows it after joining succeeds, just before its redirect, once, and only
// when the person has no photo. Every exit (photo saved, Use this photo, Skip)
// goes to the same place the redirect would have (keeps ?next=).
// Behind NEXT_PUBLIC_FEATURE_PROFILE_PHOTO.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PhotoCropDialog } from '@/components/shared/PhotoCropDialog';
import { usePhotoUpload } from '@/components/shared/usePhotoUpload';
import { ACCEPTED_PHOTO_TYPES, AccountPhotoFace, UploadVeil } from '@/components/shared/AccountPhotoParts';
import { PhotoCircle } from '@/components/shared/AccountPhoto';
import { invitePhotoSeenKey } from '@/lib/account-photo';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import {
  accountPhotoUploadOptions,
  saveGoogleAccountPhoto,
  useAccountPhotoStore,
} from '@/stores/useAccountPhotoStore';
import { GoogleMark, Heading, Lede, OnboardingFrame, icons, primaryButtonClass, secondaryButtonClass } from './OnboardingFrame';

/** Whether this person already saw the step (on this device). */
export function readInvitePhotoSeen(userId: string): boolean {
  try {
    return window.localStorage.getItem(invitePhotoSeenKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function markInvitePhotoSeen(userId: string): void {
  try {
    window.localStorage.setItem(invitePhotoSeenKey(userId), '1');
  } catch {
    // Private mode: the step may show again on a later join. Harmless.
  }
}

const FACE = 128;

export function InvitePhotoStep({
  userId,
  name,
  teamName,
  googleSuggestionUrl,
  onDone,
}: {
  userId: string;
  name: string;
  teamName: string;
  googleSuggestionUrl: string | null;
  onDone: () => void;
}) {
  const leftRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  const leave = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    onDoneRef.current();
  };

  const base = accountPhotoUploadOptions(userId, 'invite_accept');
  const { bindInput, ...photo } = usePhotoUpload({
    ...base,
    onSaved: (url, info) => {
      base.onSaved(url, info);
      if (!info.removed) leave();
    },
  });

  // The Google photo is only a suggestion: nothing is saved until "Use this
  // photo". Picking a file of your own replaces the suggestion.
  const [suggestion, setSuggestion] = useState<string | null>(googleSuggestionUrl);
  const [suggestionBroken, setSuggestionBroken] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const showGoogle = Boolean(suggestion) && !suggestionBroken;

  const saveGoogle = async () => {
    setGoogleFailed(false);
    setGoogleBusy(true);
    try {
      const url = await saveGoogleAccountPhoto();
      useAccountPhotoStore.getState().setPhoto(userId, url);
      captureAnalyticsEvent({
        name: 'profile_photo_saved',
        properties: { surface: 'account_photo', place: 'invite_accept', source: 'google' },
      });
      leave();
    } catch {
      setGoogleFailed(true);
      setGoogleBusy(false);
    }
  };

  const pickOwn = () => {
    setGoogleFailed(false);
    photo.reset();
    photo.pick();
  };

  // A chosen file replaces the Google suggestion from the crop step on.
  const confirmCrop = (file: File) => {
    setSuggestion(null);
    setGoogleFailed(false);
    photo.confirmCrop(file);
  };

  const skip = () => {
    captureAnalyticsEvent({ name: 'account_photo_skipped', properties: { place: 'invite_accept', had_google: showGoogle } });
    leave();
  };

  const uploading = photo.uploading || googleBusy;
  const failed = photo.failed || googleFailed;

  let face;
  if (googleBusy && suggestion) {
    face = <PhotoCircle src={suggestion} size={FACE} onFail={() => undefined} overlay={<UploadVeil large />} />;
  } else if (showGoogle && suggestion && !photo.uploading && !photo.failed) {
    face = (
      <PhotoCircle
        src={suggestion}
        size={FACE}
        onFail={() => setSuggestionBroken(true)}
        overlay={
          <span
            aria-hidden="true"
            className="absolute -bottom-[3px] -right-[3px] z-[2] grid h-8 w-8 place-items-center rounded-full bg-white shadow-[0_0_0_3px_rgb(var(--color-bg-base))]"
          >
            <GoogleMark />
          </span>
        }
      />
    );
  } else {
    face = (
      <AccountPhotoFace
        name={name}
        size={FACE}
        previewUrl={photo.previewUrl}
        uploading={photo.uploading}
        badgeSize={40}
        badgeRing="border-bg-base"
        badgeBorder={3}
      />
    );
  }

  let caption: ReactNode = null;
  if (uploading) {
    caption = <p className="mt-3 text-center text-[13px] text-content-secondary">Uploading. This can take a minute on slow data.</p>;
  } else if (failed) {
    caption = (
      <p role="alert" className="mt-3 text-center text-[13px] text-status-error">
        Your photo did not upload. Try again or skip.
      </p>
    );
  } else if (showGoogle) {
    caption = (
      <p className="mt-3 text-center text-[13px] text-content-secondary">From your Google account. Tap the photo to pick another.</p>
    );
  } else if (photo.error) {
    caption = (
      <p role="alert" className="mt-3 text-center text-[13px] text-status-error">
        {photo.error}
      </p>
    );
  }

  let primaryLabel = 'Add photo';
  let primaryAction: () => void = photo.pick;
  if (failed) {
    primaryLabel = 'Try again';
    primaryAction = googleFailed ? () => void saveGoogle() : photo.retry;
  } else if (showGoogle) {
    primaryLabel = 'Use this photo';
    primaryAction = () => void saveGoogle();
  }

  return (
    <OnboardingFrame name={name} narrow>
      <div className="flex min-h-[calc(100dvh-8rem)] animate-fade-in flex-col md:min-h-0">
        <p className="mb-3.5 inline-flex items-center gap-2 text-[13.5px] text-content-secondary">
          <span aria-hidden="true" className="grid h-[18px] w-[18px] place-items-center rounded-full bg-brand/15 text-brand [&_svg]:h-3 [&_svg]:w-3">
            {icons.check}
          </span>
          <span>
            You joined <b className="font-semibold text-content-primary">{teamName}</b>
          </span>
        </p>
        <Heading>Add your photo</Heading>
        <Lede>So your team knows it&apos;s you.</Lede>

        <div className="mt-9 flex flex-col items-center">
          <button
            type="button"
            onClick={pickOwn}
            disabled={uploading}
            aria-label={showGoogle ? 'Pick another photo' : 'Add your photo'}
            className="motion-focus rounded-full disabled:cursor-default"
          >
            {face}
          </button>
          <div aria-live="polite">{caption}</div>
        </div>

        <div className="mt-auto pt-10 md:mt-10">
          <button type="button" onClick={primaryAction} disabled={uploading} className={primaryButtonClass}>
            {primaryLabel}
          </button>
          <button type="button" onClick={skip} className={`${secondaryButtonClass} mt-2 border-transparent`}>
            Skip
          </button>
        </div>
      </div>

      <input ref={bindInput} type="file" accept={ACCEPTED_PHOTO_TYPES} className="hidden" onChange={photo.onFileChange} />
      {photo.cropping ? (
        <PhotoCropDialog file={photo.cropping} name={name} onCancel={photo.cancelCrop} onConfirm={confirmCrop} />
      ) : null}
    </OnboardingFrame>
  );
}
