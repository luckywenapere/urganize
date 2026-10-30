'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { isAccountPhotoEnabled, mayRetryBrokenPhoto } from '@/lib/account-photo';
import { accountPhotoUploadStore, useAccountPhotoStore, useOwnPhotoUrl } from '@/stores/useAccountPhotoStore';
import { resetPhotoUploadStore } from '@/lib/photo-upload-store';

/**
 * Your own photo, client side (NEXT_PUBLIC_FEATURE_PROFILE_PHOTO).
 * docs/notes/2026-10-30-profile-photo.md.
 */

/** Keeps useAccountPhotoStore current: on sign-in, on tab focus after ~45
 *  minutes, and cleared on sign-out. Renders nothing; inert with the flag off. */
export function AccountPhotoSync() {
  const userId = useAuthStore((state) => (state.isAuthenticated ? state.user?.id ?? null : null));
  const refresh = useAccountPhotoStore((state) => state.refresh);
  const clear = useAccountPhotoStore((state) => state.clear);
  const lastUserId = useRef<string | null>(null);

  // A pending or failed upload belongs to whoever picked it. When the person
  // changes (sign-out, or another account on a shared phone without a
  // reload), drop it, so the next person can never "Try again" with it.
  useEffect(() => {
    if (lastUserId.current !== null && lastUserId.current !== userId) {
      resetPhotoUploadStore(accountPhotoUploadStore);
    }
    lastUserId.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!isAccountPhotoEnabled()) return;
    if (!userId) {
      clear();
      return;
    }
    void refresh(userId);
    const onFocus = () => {
      if (document.visibilityState === 'visible') void refresh(userId);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [userId, refresh, clear]);

  return null;
}

/** The signed-in person's photo URL, or null. */
export function useMyPhotoUrl(): string | null {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return useOwnPhotoUrl(userId);
}

/**
 * A photo in a circle with the 1px hairline from the mocks (stroke at 14%, so
 * a pale photo keeps its edge on cream). An <img> that fails (an expired link,
 * offline) calls `onFail` and the caller shows initials; for your own photo it
 * also asks for a fresh link once.
 */
export function PhotoCircle({
  src,
  size,
  onFail,
  overlay,
  className = '',
}: {
  src: string;
  size: number;
  onFail: () => void;
  /** Drawn on top, outside the clip (the new-item dot, a badge, a veil). */
  overlay?: ReactNode;
  className?: string;
}) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="absolute inset-0 overflow-hidden rounded-full bg-bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          decoding="async"
          referrerPolicy="no-referrer"
          className="block h-full w-full object-cover"
          onError={onFail}
        />
        <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgb(var(--color-stroke)/0.14)]" />
      </span>
      {overlay}
    </span>
  );
}

/** Shared by every MyFace on screen: when one last asked for a fresh link. */
let lastBrokenPhotoRetryAt: number | null = null;

/**
 * Your photo if there is one and it loads, else `fallback` (the caller's own
 * initials tile, unchanged from before the photo existed).
 */
export function MyFace({
  size,
  fallback,
  overlay,
  className,
}: {
  size: number;
  fallback: ReactNode;
  overlay?: ReactNode;
  className?: string;
}) {
  const photoUrl = useMyPhotoUrl();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const refresh = useAccountPhotoStore((state) => state.refresh);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!photoUrl || failedUrl === photoUrl) return <>{fallback}</>;
  return (
    <PhotoCircle
      src={photoUrl}
      size={size}
      className={className}
      overlay={overlay}
      onFail={() => {
        setFailedUrl(photoUrl);
        // An expired signed link: ask for a fresh one, at most once every
        // five minutes across every face (a fresh link is a new url, so a
        // per-url guard would loop when the image itself is blocked).
        const now = Date.now();
        if (userId && mayRetryBrokenPhoto(lastBrokenPhotoRetryAt, now)) {
          lastBrokenPhotoRetryAt = now;
          void refresh(userId, { force: true });
        }
      }}
    />
  );
}
