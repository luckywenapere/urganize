'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { isAccountPhotoEnabled, shouldRefreshAccountPhoto, type AccountPhotoPlace } from '@/lib/account-photo';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { createPhotoUploadStore, type PhotoUploadOptions } from '@/lib/photo-upload-store';

/**
 * The signed-in person's own photo (NEXT_PUBLIC_FEATURE_PROFILE_PHOTO).
 *
 * NOT persisted: a signed URL lives an hour, so it is fetched on app load
 * (AccountPhotoSync), again when the tab comes back after ~45 minutes, and
 * once more when an <img> fails (an expired link). `userId` scopes the value so
 * a sign-out and a different sign-in never shows the last person's face.
 */

type AccountPhotoState = {
  userId: string | null;
  photoUrl: string | null;
  fetchedAt: number | null;
  /** True once the first read for this user answered (photo or not). */
  loaded: boolean;
  setPhoto: (userId: string, photoUrl: string | null) => void;
  refresh: (userId: string, options?: { force?: boolean }) => Promise<void>;
  clear: () => void;
};

async function authHeader(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

let inFlight: Promise<void> | null = null;
let inFlightUser: string | null = null;

export const useAccountPhotoStore = create<AccountPhotoState>((set, get) => ({
  userId: null,
  photoUrl: null,
  fetchedAt: null,
  loaded: false,
  setPhoto: (userId, photoUrl) => set({ userId, photoUrl, fetchedAt: Date.now(), loaded: true }),
  clear: () => set({ userId: null, photoUrl: null, fetchedAt: null, loaded: false }),
  refresh: async (userId, options = {}) => {
    if (!isAccountPhotoEnabled() || !userId) return;
    const state = get();
    if (state.userId !== userId) set({ userId, photoUrl: null, fetchedAt: null, loaded: false });
    else if (!options.force && !shouldRefreshAccountPhoto(state.fetchedAt, Date.now())) return;
    if (inFlight && inFlightUser === userId) return inFlight;
    inFlightUser = userId;
    inFlight = (async () => {
      try {
        const headers = await authHeader();
        if (!headers) return;
        const response = await fetch('/api/account/photo', { headers, cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as { photoUrl?: unknown } | null;
        // A different person signed in meanwhile: drop the answer.
        if (get().userId !== userId) return;
        set({
          photoUrl: typeof payload?.photoUrl === 'string' ? payload.photoUrl : null,
          fetchedAt: Date.now(),
          loaded: true,
        });
      } catch {
        // Keep what we had; initials show if it was nothing.
      } finally {
        if (inFlightUser === userId) inFlight = null;
      }
    })();
    return inFlight;
  },
}));

/** The photo to show for `userId`, or null (flag off, someone else, none). */
export function useOwnPhotoUrl(userId: string | null | undefined): string | null {
  return useAccountPhotoStore((state) =>
    isAccountPhotoEnabled() && userId && state.userId === userId ? state.photoUrl : null
  );
}

// ── Saving ───────────────────────────────────────────────────────────────────

export const ACCOUNT_PHOTO_SIGN_URL = '/api/account/photo/sign';

/** PUT /api/account/photo; resolves to the new signed URL (null after a removal). */
export async function saveAccountPhoto(photoPath: string | null): Promise<string | null> {
  const headers = await authHeader();
  if (!headers) throw new Error('Sign in again to change the photo.');
  const response = await fetch('/api/account/photo', {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoPath }),
  });
  const payload = (await response.json().catch(() => ({}))) as { photoUrl?: unknown; error?: unknown };
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not save the photo.');
  return typeof payload.photoUrl === 'string' ? payload.photoUrl : null;
}

/** POST /api/account/photo/google: the server copies the account's Google photo. */
export async function saveGoogleAccountPhoto(): Promise<string | null> {
  const headers = await authHeader();
  if (!headers) throw new Error('Sign in again to change the photo.');
  const response = await fetch('/api/account/photo/google', { method: 'POST', headers });
  const payload = (await response.json().catch(() => ({}))) as { photoUrl?: unknown; error?: unknown };
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not save the photo.');
  return typeof payload.photoUrl === 'string' ? payload.photoUrl : null;
}

/** GET /api/account/photo?suggest=google, for the invitee step. */
export async function readAccountPhotoWithSuggestion(): Promise<{ photoUrl: string | null; googleSuggestionUrl: string | null } | null> {
  const headers = await authHeader();
  if (!headers) return null;
  try {
    const response = await fetch('/api/account/photo?suggest=google', { headers, cache: 'no-store' });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return {
      photoUrl: typeof payload?.photoUrl === 'string' ? payload.photoUrl : null,
      googleSuggestionUrl: typeof payload?.googleSuggestionUrl === 'string' ? payload.googleSuggestionUrl : null,
    };
  } catch {
    return null;
  }
}

/** One upload store for the account photo, shared across screens, so an
 *  upload started on onboarding keeps going after Continue. */
export const accountPhotoUploadStore = createPhotoUploadStore();

/** usePhotoUpload options for the account photo, at `place`. */
export function accountPhotoUploadOptions(userId: string, place: AccountPhotoPlace): PhotoUploadOptions {
  return {
    signUrl: ACCOUNT_PHOTO_SIGN_URL,
    save: saveAccountPhoto,
    surface: 'account_photo',
    store: accountPhotoUploadStore,
    onSaved: (photoUrl, { removed }) => {
      useAccountPhotoStore.getState().setPhoto(userId, photoUrl);
      if (!removed) {
        captureAnalyticsEvent({
          name: 'profile_photo_saved',
          properties: { surface: 'account_photo', place, source: 'upload' },
        });
      }
    },
  };
}
