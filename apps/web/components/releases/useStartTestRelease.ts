'use client';

// The one-tap half of the test path (NEXT_PUBLIC_FEATURE_TEST_RELEASE,
// founder request 2026-09-01): creates the canned release from
// lib/test-release's buildTestReleaseDraft — no form, no decisions — then
// lands the user scoped to it, where TestReleaseBanner carries the
// orientation copy and the path's exit ("Delete test release").
//
// Two deliberate deviations from CreateReleaseModal's submit, recorded here
// so neither gets "fixed" back:
//
// 1. NO `&new=1` on the navigation. The NewReleaseGuide consumption effect in
//    WorkspaceView is mount-once (empty dep array — it reads the param at
//    mount and strips it), and the empty-state entry point fires while the
//    user is ALREADY on /dashboard, where no remount happens, so the guide
//    could never show. The standing banner orients instead — one surface that
//    both explains the thing and offers the way out.
//
// 2. The store resync is AWAITED before the push, where the modal fires
//    `void loadCommandCenter({ force: true })` and navigates immediately. The
//    empty-state user is already on /dashboard with isInitialLoading false,
//    so pushing early would paint the catalog branch (still empty) uncovered
//    for the whole fetch; awaiting also means the arrive-already-scoped rule
//    in WorkspaceView's auto-scope effect sees the release row and spends the
//    lone-release chance cleanly.
//
// Click-driven only — no effects, no fetch-on-mount — so it adds zero
// react-hooks findings to the lint baseline.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/components/content-calendar/get-access-token';
import { buildTestReleaseDraft } from '@/lib/test-release';
import { useReleaseStore } from '@/stores/useReleaseStore';

type CreateReleaseResponse = {
  releaseId?: string;
  id?: string;
  release?: { id?: string };
  error?: string;
};

const GENERIC_ERROR = 'Could not set up the test rollout. Try again.';

export function useStartTestRelease(options?: { onError?: (message: string) => void }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');
  // Re-entry guard as a ref, not the state: two taps in one frame both read
  // isStarting === false, and the second create would mint a second test
  // release.
  const inFlightRef = useRef(false);

  // A plain closure, not useCallback: every consumer is a click handler, so
  // referential stability buys nothing, and nothing lists this in effect deps.
  const startTestRelease = () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsStarting(true);
    setError('');

    void (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error('Session expired. Please sign in again.');
        }

        const response = await fetch('/api/releases', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...buildTestReleaseDraft(),
            // No artistId: the implicit-artist path files it under the
            // workspace's artist, same as the modal on a one-artist team.
            isTest: true,
            source: 'test_path',
            plan: 'template',
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as CreateReleaseResponse;
        if (!response.ok) {
          throw new Error(payload.error || GENERIC_ERROR);
        }

        const releaseId = payload.release?.id || payload.releaseId || payload.id || '';
        if (!releaseId) {
          throw new Error(GENERIC_ERROR);
        }

        await useReleaseStore.getState().loadCommandCenter({ force: true });
        router.push(`/dashboard?release=${releaseId}`);
      } catch (caught) {
        const message = caught instanceof Error && caught.message ? caught.message : GENERIC_ERROR;
        setError(message);
        options?.onError?.(message);
      } finally {
        inFlightRef.current = false;
        setIsStarting(false);
      }
    })();
  };

  return { startTestRelease, isStarting, error };
}
