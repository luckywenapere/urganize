'use client';

import type { BrandColors } from '@/lib/social-share-colors';
import { registerSignOutReset } from '@/lib/sign-out-resets';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { ROSTER_CACHE_KEY } from '@/lib/roster-cache';

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

export type RosterArtist = {
  id: string;
  name: string;
  slug: string;
  /** Signed, short-lived. Absent on payloads that predate artist photos. */
  photoUrl?: string | null;
  /** The artist's brand colors, when the API sends them (#1209). */
  brandColors?: BrandColors;
};

type ArtistRosterStore = {
  artists: RosterArtist[];
  /** True once a load has settled, successfully or not. Consumers use it to
   *  avoid flashing a picker in or out while the first fetch is in flight. */
  loaded: boolean;
  load: (options?: { force?: boolean }) => Promise<void>;
  /** Replace the roster after a mutation elsewhere (Settings add/rename). */
  setArtists: (artists: RosterArtist[]) => void;
  /** Swap one artist's face in place after an upload or removal. */
  setArtistPhoto: (artistId: string, photoUrl: string | null) => void;
};

// Recency guard + in-flight coalescing, the useWorkspaceIdentityStore pattern.
// The window is short because Settings can add an artist in another tab and the
// picker should notice on the next dashboard visit.
const ROSTER_FRESH_MS = 30_000;
let rosterLoadedAt = 0;
let rosterInFlight: Promise<void> | null = null;

async function getSessionInfo(): Promise<{ token: string; userId: string }> {
  try {
    const { data } = await supabase.auth.getSession();
    return { token: data.session?.access_token ?? '', userId: data.session?.user?.id ?? '' };
  } catch {
    return { token: '', userId: '' };
  }
}

// The roster saved on the device (Nov 2, 2026), so Home and the artist pages
// paint at once after a reload, like the rollout list does. Keyed to the
// account and only used for that same account; a day at most, since the photo
// links in it are signed and expire. Cleared by key on sign-out (auth-store).
const ROSTER_CACHE_VERSION = 1;
const ROSTER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
type RosterCache = { userId: string; artists: RosterArtist[] };
const isRosterCache = (value: unknown): value is RosterCache =>
  Boolean(value) &&
  typeof (value as RosterCache).userId === 'string' &&
  Array.isArray((value as RosterCache).artists);

export const useArtistRosterStore = create<ArtistRosterStore>((set) => ({
  artists: [],
  loaded: false,

  load: async (options) => {
    const force = options?.force === true;
    const state = useArtistRosterStore.getState();
    if (!force) {
      if (rosterInFlight) return rosterInFlight;
      if (Date.now() - rosterLoadedAt < ROSTER_FRESH_MS) return;
    }

    const run = (async () => {
      try {
        const { token, userId } = await getSessionInfo();
        if (!token) return;
        // Paint the saved roster first; the fetch below refreshes it.
        if (!state.loaded && state.artists.length === 0 && userId) {
          const saved = readPersistedState<RosterCache>(
            ROSTER_CACHE_KEY,
            ROSTER_CACHE_VERSION,
            isRosterCache,
            ROSTER_CACHE_MAX_AGE_MS
          );
          if (saved && saved.userId === userId) set({ artists: saved.artists, loaded: true });
        }
        const response = await fetch('/api/workspace/artists', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => ({}))) as {
          artists?: RosterArtist[];
        };
        const artists = Array.isArray(payload.artists) ? payload.artists : [];
        set({ artists });
        rosterLoadedAt = Date.now();
        if (userId) {
          try {
            writePersistedState<RosterCache>(ROSTER_CACHE_KEY, ROSTER_CACHE_VERSION, { userId, artists });
          } catch {
            // Storage full or blocked: the next reload just fetches.
          }
        }
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

  setArtistPhoto: (artistId, photoUrl) =>
    set((state) => ({
      artists: state.artists.map((artist) => (artist.id === artistId ? { ...artist, photoUrl } : artist)),
    })),
}));

/**
 * Forget the signed-in account's roster. Called on SIGNED_OUT (lib/auth-store.ts),
 * for the same reason as resetPressKitsStore: these are artist NAMES held in a
 * module-level store, and a same-tab account switch would otherwise offer
 * account B account A's artists — in the create-release picker and in "Book a
 * show" — until a reload.
 */
export function resetArtistRosterStore(): void {
  rosterLoadedAt = 0;
  rosterInFlight = null;
  useArtistRosterStore.setState({ artists: [], loaded: false });
}

// Sign-out: see lib/sign-out-resets.ts (runs from lib/auth-store.ts).
registerSignOutReset('artist-roster', resetArtistRosterStore);
