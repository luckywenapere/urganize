'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';

// The team's artist roster, loaded once and shared.
//
// It exists because three surfaces need the same list and were about to fetch
// it three ways: the create-release modal (to decide whether to show its
// picker), the workspace header (to decide whether "Change artist" is worth
// offering), and the dialog behind that action. The modal shipped with its own
// per-open fetch on 2026-08-30; this replaces it, so opening the form five
// times is now one request rather than five.
//
// NOT folded into useWorkspaceIdentityStore even though that one already
// carries `artistCount` from the same endpoint: the identity card is behind
// NEXT_PUBLIC_FEATURE_IDENTITY_PANEL, which defaults OFF, so that store is not
// reliably loaded and reading the roster from it would make the picker vanish
// in a default deployment.
//
// FAILS OPEN THROUGHOUT: every failure leaves `artists` empty and `loaded`
// true, and each consumer treats an empty roster as "no choice to offer",
// which is the pre-roster behaviour. A broken fetch must never block creating
// a release.

export type RosterArtist = { id: string; name: string; slug: string };

type ArtistRosterStore = {
  artists: RosterArtist[];
  /** True once a load has settled, successfully or not. Consumers use it to
   *  avoid flashing a picker in or out while the first fetch is in flight. */
  loaded: boolean;
  load: (options?: { force?: boolean }) => Promise<void>;
  /** Replace the roster after a mutation elsewhere (Settings add/rename). */
  setArtists: (artists: RosterArtist[]) => void;
};

// Recency guard + in-flight coalescing, the useWorkspaceIdentityStore pattern.
// The window is short because Settings can add an artist in another tab and the
// picker should notice on the next dashboard visit.
const ROSTER_FRESH_MS = 30_000;
let rosterLoadedAt = 0;
let rosterInFlight: Promise<void> | null = null;

async function getAccessToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  } catch {
    return '';
  }
}

export const useArtistRosterStore = create<ArtistRosterStore>((set) => ({
  artists: [],
  loaded: false,

  load: async (options) => {
    const force = options?.force === true;
    if (!force) {
      if (rosterInFlight) return rosterInFlight;
      if (Date.now() - rosterLoadedAt < ROSTER_FRESH_MS) return;
    }

    const run = (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await fetch('/api/workspace/artists', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => ({}))) as {
          artists?: RosterArtist[];
        };
        set({ artists: Array.isArray(payload.artists) ? payload.artists : [] });
        rosterLoadedAt = Date.now();
      } catch {
        // Offline, or mid-deploy. Leave whatever we had; `loaded` still flips
        // so consumers stop waiting on a fetch that is not coming back.
      } finally {
        set({ loaded: true });
        rosterInFlight = null;
      }
    })();

    rosterInFlight = run;
    return run;
  },

  setArtists: (artists) => {
    rosterLoadedAt = Date.now();
    set({ artists, loaded: true });
  },
}));
