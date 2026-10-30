'use client';

import { create } from 'zustand';

/**
 * The open rollout's id from the address (?release=), for the app's chrome.
 *
 * Since Oct 30, 2026 Home (the artist list) and a rollout share the path
 * /dashboard, so the chrome needs the query to tell them apart. The chrome
 * renders on the server outside any Suspense boundary, where useSearchParams
 * would fail the static build, so it reads this store instead.
 * ReleaseParamSync is its one writer, mounted inside its own Suspense.
 */
type ReleaseParamState = {
  releaseId: string | null;
  setReleaseId: (releaseId: string | null) => void;
};

export const useReleaseParamStore = create<ReleaseParamState>((set) => ({
  releaseId: null,
  setReleaseId: (releaseId) => set((state) => (state.releaseId === releaseId ? state : { releaseId })),
}));
