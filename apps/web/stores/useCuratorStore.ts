'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import {
  CURATOR_NETWORK_ERROR,
  describeCuratorFailure,
  readServerMessage,
} from '@/lib/curator-errors';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import type {
  CuratorPitch,
  CuratorPlaylist,
  CuratorProfile,
  PitchPlatform,
  PitchStatus,
} from '@/types/pitching';

// The playlist owner's whole side of the product in one store: profile,
// playlists, inbox. Mechanics copied from useNotesStore — module-scope recency
// guard, in-flight coalescing, cache-first paint keyed to the session user,
// force reload after a mutation.
//
// Three separate fetches rather than one aggregate: the three tabs are visited
// independently, and a curator who only ever opens the inbox should never pay
// for the other two.

const FRESH_MS = 15_000;

let profileLoadedAt = 0;
let playlistsLoadedAt = 0;
let pitchesLoadedAt = 0;
let profileInFlight: Promise<void> | null = null;
let playlistsInFlight: Promise<void> | null = null;
let pitchesInFlight: Promise<void> | null = null;

const CACHE_KEY = 'urganize.cache.curator';
const CACHE_VERSION = 1;

// The inbox is capped in the cache for the same reason the notes cache is: it
// exists to paint the first screen, which needs the top of the list.
const PITCH_CACHE_LIMIT = 40;

type CuratorCache = {
  userId: string;
  profile: CuratorProfile | null;
  playlists: CuratorPlaylist[];
  pitches: CuratorPitch[];
};

const isCuratorCache = (value: unknown): value is CuratorCache => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.userId === 'string' &&
    Array.isArray(record.playlists) &&
    Array.isArray(record.pitches)
  );
};

export type PlaylistInput = {
  name: string;
  platform: PitchPlatform;
  url: string;
  genres: string[];
  followerCount: number | null;
};

type CuratorStore = {
  profile: CuratorProfile | null;
  playlists: CuratorPlaylist[];
  pitches: CuratorPitch[];
  hydrated: boolean;
  isLoadingProfile: boolean;
  isLoadingPlaylists: boolean;
  isLoadingPitches: boolean;
  /**
   * Why the last load of each surface failed, or '' when it did not.
   *
   * Three fields rather than one, mirroring the three isLoading* flags above:
   * each curator page loads exactly one of these, and a shared field would let
   * one surface's failure caption another's.
   *
   * Replaced an `isForbidden` boolean that NOTHING read, which is what made a
   * failed load silent — see lib/curator-errors.ts.
   */
  profileError: string;
  playlistsError: string;
  pitchesError: string;
  loadProfile: (options?: { force?: boolean }) => Promise<void>;
  loadPlaylists: (options?: { force?: boolean }) => Promise<void>;
  loadPitches: (options?: { force?: boolean }) => Promise<void>;
  saveProfile: (patch: {
    displayName?: string;
    bio?: string;
    photoPath?: string | null;
    slug?: string;
  }) => Promise<void>;
  /** Put her public page live, minting a handle on the first call. */
  publishPage: () => Promise<void>;
  /** Take it down. The handle is kept, so publishing again restores the URL. */
  unpublishPage: () => Promise<void>;
  createPlaylist: (input: PlaylistInput) => Promise<void>;
  updatePlaylist: (playlistId: string, patch: Partial<PlaylistInput>) => Promise<void>;
  removePlaylist: (playlistId: string) => Promise<void>;
  setPitchStatus: (pitchId: string, status: PitchStatus, reply?: string) => Promise<void>;
};

/**
 * Publish or unpublish, then let loadProfile be the one thing that decides what
 * the page shows. The route answers with the slug and the timestamp, but
 * re-reading keeps ONE shape of profile in the store rather than a second,
 * thinner one patched in from here.
 */
async function setPagePublished(method: 'POST' | 'DELETE', signedOutMessage: string) {
  const { accessToken } = await getSession();
  if (!accessToken) throw new Error(signedOutMessage);

  let response: Response;
  try {
    response = await fetch('/api/curator/profile/publish', {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(CURATOR_NETWORK_ERROR);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      describeCuratorFailure({ status: response.status, serverMessage: payload?.error })
    );
  }
}

async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    accessToken: session?.access_token || '',
    userId: session?.user?.id || '',
  };
}

/** Reads the whole cache blob so one slice's write never drops another's. */
function readCache(userId: string): CuratorCache | null {
  if (!userId) return null;
  const cached = readPersistedState<CuratorCache>(CACHE_KEY, CACHE_VERSION, isCuratorCache);
  return cached && cached.userId === userId ? cached : null;
}

// writePersistedState does not guard localStorage quota throws, and this runs
// inside async store actions where an uncaught throw becomes an unhandled
// rejection. A cache miss costs a repaint; a crash costs the page.
function writeCache(userId: string, patch: Partial<Omit<CuratorCache, 'userId'>>) {
  if (!userId) return;
  try {
    const current = readCache(userId);
    writePersistedState<CuratorCache>(CACHE_KEY, CACHE_VERSION, {
      userId,
      profile: patch.profile !== undefined ? patch.profile : current?.profile || null,
      playlists: patch.playlists !== undefined ? patch.playlists : current?.playlists || [],
      pitches: (patch.pitches !== undefined ? patch.pitches : current?.pitches || []).slice(
        0,
        PITCH_CACHE_LIMIT
      ),
    });
  } catch {
    // Ignore: the next load repaints from the network.
  }
}

export const useCuratorStore = create<CuratorStore>((set, get) => ({
  profile: null,
  playlists: [],
  pitches: [],
  hydrated: false,
  isLoadingProfile: true,
  isLoadingPlaylists: true,
  isLoadingPitches: true,
  profileError: '',
  playlistsError: '',
  pitchesError: '',

  loadProfile: async (options) => {
    if (!options?.force) {
      if (profileInFlight) return profileInFlight;
      if (get().profile && Date.now() - profileLoadedAt < FRESH_MS) return;
    }

    const run = (async () => {
      const { accessToken, userId } = await getSession();

      if (!get().hydrated) {
        const cached = readCache(userId);
        if (cached) {
          set({
            profile: cached.profile,
            playlists: cached.playlists,
            pitches: cached.pitches,
            hydrated: true,
          });
        }
      }

      if (!accessToken) {
        set({ isLoadingProfile: false });
        return;
      }

      try {
        set({ profileError: '' });
        const response = await fetch('/api/curator/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          set({
            profileError: describeCuratorFailure({
              status: response.status,
              serverMessage: await readServerMessage(response),
            }),
          });
          return;
        }
        const payload = (await response.json().catch(() => null)) as {
          profile?: CuratorProfile;
        } | null;
        if (!payload?.profile) {
          set({ profileError: describeCuratorFailure({ status: response.status }) });
          return;
        }
        // The signed photo URL is never cached: it expires, and a stale one
        // renders a broken image on the next visit.
        writeCache(userId, { profile: { ...payload.profile, photoUrl: null } });
        profileLoadedAt = Date.now();
        set({ profile: payload.profile, hydrated: true });
      } catch {
        // No response at all: offline, a dropped connection, a killed tab. This
        // is the case the whole error surface exists for — without it the fetch
        // rejects into an unhandled promise and the page shows an empty form.
        set({ profileError: CURATOR_NETWORK_ERROR });
      } finally {
        set({ isLoadingProfile: false });
      }
    })();

    profileInFlight = run;
    try {
      await run;
    } finally {
      if (profileInFlight === run) profileInFlight = null;
    }
  },

  loadPlaylists: async (options) => {
    if (!options?.force) {
      if (playlistsInFlight) return playlistsInFlight;
      if (get().hydrated && Date.now() - playlistsLoadedAt < FRESH_MS) return;
    }

    const run = (async () => {
      const { accessToken, userId } = await getSession();
      if (!accessToken) {
        set({ isLoadingPlaylists: false });
        return;
      }
      try {
        set({ playlistsError: '' });
        const response = await fetch('/api/curator/playlists', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          set({
            playlistsError: describeCuratorFailure({
              status: response.status,
              serverMessage: await readServerMessage(response),
            }),
          });
          return;
        }
        const payload = (await response.json().catch(() => null)) as {
          playlists?: CuratorPlaylist[];
        } | null;
        if (!payload || !Array.isArray(payload.playlists)) {
          set({ playlistsError: describeCuratorFailure({ status: response.status }) });
          return;
        }
        writeCache(userId, { playlists: payload.playlists });
        playlistsLoadedAt = Date.now();
        set({ playlists: payload.playlists, hydrated: true });
      } catch {
        set({ playlistsError: CURATOR_NETWORK_ERROR });
      } finally {
        set({ isLoadingPlaylists: false });
      }
    })();

    playlistsInFlight = run;
    try {
      await run;
    } finally {
      if (playlistsInFlight === run) playlistsInFlight = null;
    }
  },

  loadPitches: async (options) => {
    if (!options?.force) {
      if (pitchesInFlight) return pitchesInFlight;
      if (get().hydrated && Date.now() - pitchesLoadedAt < FRESH_MS) return;
    }

    const run = (async () => {
      const { accessToken, userId } = await getSession();

      if (!get().hydrated) {
        const cached = readCache(userId);
        if (cached) {
          set({
            profile: cached.profile,
            playlists: cached.playlists,
            pitches: cached.pitches,
            hydrated: true,
          });
        }
      }

      if (!accessToken) {
        set({ isLoadingPitches: false });
        return;
      }
      try {
        set({ pitchesError: '' });
        const response = await fetch('/api/curator/pitches', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          set({
            pitchesError: describeCuratorFailure({
              status: response.status,
              serverMessage: await readServerMessage(response),
            }),
          });
          return;
        }
        const payload = (await response.json().catch(() => null)) as {
          pitches?: CuratorPitch[];
        } | null;
        if (!payload || !Array.isArray(payload.pitches)) {
          set({ pitchesError: describeCuratorFailure({ status: response.status }) });
          return;
        }
        writeCache(userId, { pitches: payload.pitches });
        pitchesLoadedAt = Date.now();
        set({ pitches: payload.pitches, hydrated: true });
      } catch {
        set({ pitchesError: CURATOR_NETWORK_ERROR });
      } finally {
        set({ isLoadingPitches: false });
      }
    })();

    pitchesInFlight = run;
    try {
      await run;
    } finally {
      if (pitchesInFlight === run) pitchesInFlight = null;
    }
  },

  saveProfile: async (patch) => {
    const { accessToken } = await getSession();
    if (!accessToken) throw new Error('Sign in again to save your profile.');

    // A dropped connection throws here rather than returning a response. The
    // page renders whatever this throws, so it has to be the same sentence the
    // loaders use for the same failure, not a stack trace.
    let response: Response;
    try {
      response = await fetch('/api/curator/profile', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });
    } catch {
      throw new Error(CURATOR_NETWORK_ERROR);
    }

    const payload = (await response.json().catch(() => null)) as {
      profile?: CuratorProfile;
      error?: string;
    } | null;
    if (!response.ok) {
      throw new Error(
        describeCuratorFailure({ status: response.status, serverMessage: payload?.error })
      );
    }
    if (payload?.profile) {
      profileLoadedAt = Date.now();
      set({ profile: payload.profile });
    }
  },

  publishPage: async () => {
    await setPagePublished('POST', 'Sign in again to publish your page.');
    await useCuratorStore.getState().loadProfile({ force: true });
  },

  unpublishPage: async () => {
    await setPagePublished('DELETE', 'Sign in again to take your page down.');
    await useCuratorStore.getState().loadProfile({ force: true });
  },

  createPlaylist: async (input) => {
    const { accessToken } = await getSession();
    if (!accessToken) throw new Error('Sign in again to add a playlist.');

    const response = await fetch('/api/curator/playlists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      playlist?: CuratorPlaylist;
      error?: string;
    } | null;
    if (!response.ok) throw new Error(payload?.error || 'Could not add the playlist.');
    await get().loadPlaylists({ force: true });
  },

  updatePlaylist: async (playlistId, patch) => {
    const { accessToken } = await getSession();
    if (!accessToken) throw new Error('Sign in again to save the playlist.');

    const response = await fetch(`/api/curator/playlists/${encodeURIComponent(playlistId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
    const payload = (await response.json().catch(() => null)) as {
      playlist?: CuratorPlaylist;
      error?: string;
    } | null;
    if (!response.ok) throw new Error(payload?.error || 'Could not save the playlist.');
    if (payload?.playlist) {
      const updated = payload.playlist;
      set({
        playlists: get().playlists.map((item) => (item.id === updated.id ? updated : item)),
      });
    }
  },

  removePlaylist: async (playlistId) => {
    const { accessToken } = await getSession();
    if (!accessToken) throw new Error('Sign in again to remove the playlist.');

    // Optimistic: the row disappears on tap. A failure reloads server truth
    // rather than trying to put the row back in the right position.
    const previous = get().playlists;
    set({ playlists: previous.filter((item) => item.id !== playlistId) });

    const response = await fetch(`/api/curator/playlists/${encodeURIComponent(playlistId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      await get().loadPlaylists({ force: true });
      throw new Error(payload?.error || 'Could not remove the playlist.');
    }
  },

  setPitchStatus: async (pitchId, status, reply) => {
    const { accessToken } = await getSession();
    if (!accessToken) throw new Error('Sign in again to update this pitch.');

    // Optimistic so a one-tap status change feels like one tap. Merged, not
    // replaced, so a status change in flight cannot clobber a reply.
    const previous = get().pitches;
    set({
      pitches: previous.map((pitch) =>
        pitch.id === pitchId
          ? { ...pitch, status, reply: reply?.trim() ? reply.trim() : null }
          : pitch
      ),
    });

    const response = await fetch(`/api/curator/pitches/${encodeURIComponent(pitchId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, ...(reply === undefined ? {} : { reply }) }),
    });
    const payload = (await response.json().catch(() => null)) as {
      pitch?: CuratorPitch;
      error?: string;
    } | null;

    if (!response.ok) {
      await get().loadPitches({ force: true });
      throw new Error(payload?.error || 'Could not update the pitch.');
    }

    if (payload?.pitch) {
      const updated = payload.pitch;
      const pitches = get().pitches.map((pitch) => (pitch.id === updated.id ? updated : pitch));
      set({ pitches });
      const { userId } = await getSession();
      writeCache(userId, { pitches });
    }
  },
}));
