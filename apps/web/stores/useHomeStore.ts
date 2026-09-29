'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { isNetworkFailure } from '@/lib/offline/network-error';
import type { HomePayload } from '@/lib/home/types';
import type { CommandCenterData } from '@/lib/execution-types';

type HomeStore = {
  data: HomePayload | null;
  isLoading: boolean;
  error: string;
  load: (options?: { force?: boolean }) => Promise<void>;
  /** Called from the auth store's SIGNED_OUT handler, alongside every other
   * store's own reset — a same-tab sign-out then sign-in as a different
   * account must never show the previous account's role, state or brief. */
  reset: () => void;
};

const HOME_FRESH_MS = 10_000; // mirrors useReleaseStore's COMMAND_CENTER_FRESH_MS
let homeLoadedAt = 0;
let homeLoadInFlight: Promise<void> | null = null;

export const useHomeStore = create<HomeStore>((set, get) => ({
  data: null,
  isLoading: true,
  error: '',
  load: async (options) => {
    if (!options?.force) {
      if (homeLoadInFlight) return homeLoadInFlight;
      if (get().data && Date.now() - homeLoadedAt < HOME_FRESH_MS) return;
    }

    const run = (async (): Promise<void> => {
      set((state) => ({ isLoading: !state.data, error: '' }));

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) {
        // Same "no session yet is normal, not an error" reasoning as
        // useReleaseStore.loadCommandCenter: this races the GoTrue chain
        // rather than waiting on the auth store, and the page's own auth
        // effect owns the /auth redirect.
        set({ isLoading: false });
        return;
      }

      // The Home-only half of the response is stashed here rather than
      // applied inside the fetch closure below, so it's applied exactly
      // once — the closure may not even run if another loadCommandCenterVia
      // call is already in flight and this one piggybacks on it (in which
      // case the OTHER caller's own load() is the one that will apply it).
      let homePayload: HomePayload | null = null;
      let fetchErrorMessage = '';

      // Routes the actual network request through the release store's
      // shared command-center apply logic (the stale-response guard, the
      // in-flight-completion merge, and the cache write all happen there),
      // and takes its in-flight slot so a concurrent loadCommandCenter()
      // elsewhere in the app (e.g. WorkspaceIdentityPanel's own mount load)
      // piggybacks on THIS request instead of firing a second one.
      await useReleaseStore.getState().loadCommandCenterVia(async () => {
        let response: Response;
        try {
          response = await fetch('/api/home', {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: 'no-store',
          });
        } catch (fetchError) {
          // Re-thrown: loadCommandCenterVia's own catch classifies network
          // failures and degrades the release store's error state; this
          // store's own loading flag is still cleared below regardless.
          throw fetchError;
        }

        const parsed = (await response.json().catch(() => ({}))) as {
          commandCenter?: CommandCenterData;
          home?: HomePayload;
          error?: string;
        };
        if (!response.ok || !parsed.commandCenter || !parsed.home) {
          fetchErrorMessage = parsed.error || 'Could not load Home.';
          return null;
        }

        homePayload = parsed.home;
        return parsed.commandCenter;
      }).catch((error) => {
        if (isNetworkFailure(error)) return null;
        throw error;
      });

      if (homePayload) {
        homeLoadedAt = Date.now();
        set({ data: homePayload, isLoading: false, error: '' });
      } else {
        set((state) => ({
          isLoading: false,
          error: state.data ? '' : fetchErrorMessage || (state.error || 'Could not load Home.'),
        }));
      }
    })();

    homeLoadInFlight = run;
    try {
      await run;
    } finally {
      if (homeLoadInFlight === run) homeLoadInFlight = null;
    }
  },
  reset: () => {
    homeLoadedAt = 0;
    set({ data: null, isLoading: true, error: '' });
  },
}));
