'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { isNetworkFailure } from '@/lib/offline/network-error';

export type WorkspaceIdentityArtist = {
  id: string;
  name: string;
  slug: string;
};

export type WorkspaceIdentityLogo = {
  fileName: string | null;
  url: string;
};

type WorkspaceIdentityStore = {
  name: string;
  artist: WorkspaceIdentityArtist | null;
  /** How many artists the team has. The card names ONE artist, so this is what
   *  stops that reading as "the team's artist" once there are several. */
  artistCount: number;
  memberCount: number;
  logo: WorkspaceIdentityLogo | null;
  /** Gates the Admin link in the identity card's nav. Visibility only —
   * every /admin route re-checks server-side via `verifyAdmin`. Deliberately
   * NOT cached (below): a stale `true` would render a link that 403s. */
  isAdmin: boolean;
  hydrated: boolean;
  load: (options?: { force?: boolean }) => Promise<void>;
  setName: (name: string) => void;
  setLogo: (logo: WorkspaceIdentityLogo | null) => void;
};

// Recency guard, mirroring useReleaseStore.loadCommandCenter -- the identity
// card mounts as persistent app chrome (every route), so without this every
// navigation would re-fetch. Mutation flows (rename, logo upload/remove)
// pass { force: true }.
const IDENTITY_FRESH_MS = 30_000;
let identityLoadedAt = 0;
let identityInFlight: Promise<void> | null = null;

// Cache-first hydration, same pattern as Settings' workspace-artist cache.
// The signed logo URL is deliberately excluded (TTL-bound -- persisting it
// would resurrect a URL that's already expired by the next visit); the
// panel shows its initials fallback until the live fetch lands.
const IDENTITY_CACHE_KEY = 'urganize.cache.workspace-identity';
const IDENTITY_CACHE_VERSION = 1;

type WorkspaceIdentityCache = {
  userId: string;
  name: string;
  artist: WorkspaceIdentityArtist | null;
  /** How many artists the team has. The card names ONE artist, so this is what
   *  stops that reading as "the team's artist" once there are several. */
  artistCount: number;
  memberCount: number;
};

const isWorkspaceIdentityCache = (value: unknown): value is WorkspaceIdentityCache => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.userId === 'string' && typeof record.name === 'string';
};

export const useWorkspaceIdentityStore = create<WorkspaceIdentityStore>((set, get) => ({
  name: '',
  artist: null,
  artistCount: 0,
  memberCount: 0,
  logo: null,
  isAdmin: false,
  hydrated: false,
  load: async (options) => {
    if (!options?.force) {
      if (identityInFlight) {
        return identityInFlight;
      }
      if (get().hydrated && Date.now() - identityLoadedAt < IDENTITY_FRESH_MS) {
        return;
      }
    }

    const run = (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      const sessionUserId = session?.user?.id || '';

      if (!get().hydrated) {
        const cached = sessionUserId
          ? readPersistedState<WorkspaceIdentityCache>(
              IDENTITY_CACHE_KEY,
              IDENTITY_CACHE_VERSION,
              isWorkspaceIdentityCache
            )
          : null;
        if (cached && cached.userId === sessionUserId) {
          set({
            name: cached.name,
            artist: cached.artist,
            artistCount: cached.artistCount ?? (cached.artist ? 1 : 0),
            memberCount: cached.memberCount,
            hydrated: true,
          });
        }
      }

      if (!accessToken) return;

      let response: Response;
      try {
        response = await fetch('/api/workspace/identity', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
      } catch (error) {
        // Offline / a dropped connection: keep whatever identity (cached or
        // in-memory) is already painted rather than throwing out of a `void
        // load(...)` call site.
        if (isNetworkFailure(error)) return;
        throw error;
      }
      if (!response.ok) return;

      const payload = (await response.json().catch(() => null)) as {
        name?: string;
        artist?: WorkspaceIdentityArtist | null;
        artistCount?: number;
        logo?: WorkspaceIdentityLogo | null;
        memberCount?: number;
        isAdmin?: boolean;
      } | null;
      if (!payload) return;

      const name = typeof payload.name === 'string' ? payload.name : '';
      const artist = payload.artist ?? null;
      const memberCount = typeof payload.memberCount === 'number' ? payload.memberCount : 0;
      // Falls back to "one if we have one", which is what every response before
      // rosters implied, so a cached or older payload reads correctly.
      const artistCount =
        typeof payload.artistCount === 'number' ? payload.artistCount : artist ? 1 : 0;

      if (sessionUserId) {
        writePersistedState<WorkspaceIdentityCache>(IDENTITY_CACHE_KEY, IDENTITY_CACHE_VERSION, {
          userId: sessionUserId,
          name,
          artist,
          artistCount,
          memberCount,
        });
      }

      identityLoadedAt = Date.now();
      set({
        name,
        artist,
        artistCount,
        memberCount,
        logo: payload.logo ?? null,
        isAdmin: payload.isAdmin === true,
        hydrated: true,
      });
    })();

    identityInFlight = run;
    try {
      await run;
    } finally {
      if (identityInFlight === run) {
        identityInFlight = null;
      }
    }
  },
  setName: (name) => set({ name }),
  setLogo: (logo) => set({ logo }),
}));
