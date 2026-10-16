'use client';

import { registerSignOutReset } from '@/lib/sign-out-resets';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { ShowEvent } from '@/types/events';

/**
 * The shows list.
 *
 * Deliberately smaller than useNotesStore: no localStorage cache. A team's
 * schedule is tens of rows and this is a fresh surface with no cold-paint
 * problem to solve yet — the cache in the notes store exists because a
 * notebook is opened constantly and can be long. Add one when a real load
 * feels slow, not before (principle 6).
 *
 * The event DETAIL screen keeps its own state (run of show, sets, items), used
 * by exactly one page. It writes back here through `upsertLocal` when a show's
 * own fields change, so the list is right the moment you go back to it, and
 * reads the list for a festival's other days.
 */

type CreateShowInput = {
  artistId: string;
  title: string;
  venueName?: string;
  city?: string;
  setStartAt?: string | null;
  setLengthMinutes?: number;
  timezone?: string;
};

/** A festival: one show per artist per day, linked by a series id. Mirrors
 *  POST /api/events/series (validated by lib/events parseSeriesCreate). */
type CreateSeriesInput = {
  seriesTitle: string;
  artistIds: string[];
  days: number;
  /** Day 1's `datetime-local` wall clock in `timezone`; later days repeat it. */
  firstDayLocalStart?: string | null;
  venueName?: string;
  city?: string;
  setLengthMinutes?: number;
  timezone?: string;
};

/** A sparse edit, in the API's own field names (PATCH /api/events/[id]). */
export type ShowPatch = Partial<{
  title: string;
  venueName: string | null;
  city: string | null;
  country: string | null;
  timezone: string;
  setStartAt: string | null;
  setLengthMinutes: number;
  stage: string | null;
  promoterName: string | null;
  promoterPhone: string | null;
  status: ShowEvent['status'];
  notes: string | null;
}>;

type EventsStore = {
  events: ShowEvent[];
  /**
   * The artists this person may book a show for (GET /api/events computes it
   * with the same rule POST enforces). Null until a load has answered: the
   * shows page waits rather than guessing, so a guest never sees "Book a show"
   * flash in and out.
   */
  bookableArtistIds: string[] | null;
  /** True until the first load settles, so a later visit renders rows rather
   *  than a skeleton. */
  isInitialLoading: boolean;
  error: string | null;
  load: (options?: { force?: boolean }) => Promise<void>;
  create: (input: CreateShowInput) => Promise<{ event: ShowEvent } | { error: string }>;
  createSeries: (input: CreateSeriesInput) => Promise<{ events: ShowEvent[] } | { error: string }>;
  update: (eventId: string, patch: ShowPatch) => Promise<{ event: ShowEvent } | { error: string }>;
  remove: (eventId: string) => Promise<{ error: string } | null>;
  removeSeries: (seriesId: string) => Promise<{ deleted: number } | { error: string }>;
  /** Reflect a show the detail page already saved, keeping its artist name
   *  (the PATCH response carries none). */
  upsertLocal: (event: ShowEvent) => void;
};

// Recency guard + in-flight coalescing, mirroring useNotesStore. Mutations
// pass { force: true } when they need server truth back.
const EVENTS_FRESH_MS = 15_000;
let loadedAt = 0;
let inFlight: Promise<void> | null = null;
/** Bumped on sign-out. A load still in flight when the account changes checks
 *  it before committing, so account A's schedule can never land after B has
 *  signed in (the reset alone could not stop a request already on the wire). */
let epoch = 0;

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** Prefer the server's own sentence over a status-derived one — it is written
 *  for the person reading it (the lib/curator-errors.ts rule). */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // Non-JSON body; fall through.
  }
  return fallback;
}

const SIGNED_OUT = 'You are signed out. Sign in and try again.';
const OFFLINE = 'Could not reach the server. Check your connection.';

export const useEventsStore = create<EventsStore>((set, get) => ({
  events: [],
  bookableArtistIds: null,
  isInitialLoading: true,
  error: null,

  load: async (options) => {
    const force = options?.force === true;
    if (!force && inFlight) return inFlight;
    if (!force && Date.now() - loadedAt < EVENTS_FRESH_MS && get().events.length > 0) {
      return;
    }

    const startedIn = epoch;
    const run = (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) {
          set({ isInitialLoading: false });
          return;
        }
        const response = await fetch('/api/events', { headers });
        if (!response.ok) {
          set({
            error: await readError(response, 'Could not load your shows.'),
            isInitialLoading: false,
          });
          return;
        }
        const body = await response.json();
        if (startedIn !== epoch) return;
        loadedAt = Date.now();
        set({
          events: Array.isArray(body.events) ? body.events : [],
          bookableArtistIds: Array.isArray(body.bookableArtistIds)
            ? (body.bookableArtistIds as string[])
            : [],
          error: null,
          isInitialLoading: false,
        });
      } catch {
        // A dropped connection is the common case on the networks this product
        // runs on. Surface it rather than rejecting into an unhandled promise.
        set({ error: OFFLINE, isInitialLoading: false });
      } finally {
        inFlight = null;
      }
    })();

    inFlight = run;
    return run;
  },

  create: async (input) => {
    try {
      const headers = await authHeaders();
      if (!headers) return { error: SIGNED_OUT };

      const response = await fetch('/api/events', {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        return { error: await readError(response, 'Could not book the show.') };
      }
      const body = await response.json();
      await get().load({ force: true });
      return { event: body.event as ShowEvent };
    } catch {
      return { error: OFFLINE };
    }
  },

  createSeries: async (input) => {
    try {
      const headers = await authHeaders();
      if (!headers) return { error: SIGNED_OUT };

      const response = await fetch('/api/events/series', {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        return { error: await readError(response, 'Could not book the shows.') };
      }
      const body = await response.json();
      await get().load({ force: true });
      return { events: Array.isArray(body.events) ? (body.events as ShowEvent[]) : [] };
    } catch {
      return { error: OFFLINE };
    }
  },

  update: async (eventId, patch) => {
    try {
      const headers = await authHeaders();
      if (!headers) return { error: SIGNED_OUT };

      const response = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        return { error: await readError(response, 'Could not save the show.') };
      }
      const body = await response.json();
      const saved = body.event as ShowEvent;
      get().upsertLocal(saved);
      return { event: { ...saved, artistName: saved.artistName || findArtistName(get().events, eventId) } };
    } catch {
      return { error: OFFLINE };
    }
  },

  remove: async (eventId) => {
    try {
      const headers = await authHeaders();
      if (!headers) return { error: SIGNED_OUT };

      const response = await fetch(`/api/events/${eventId}`, { method: 'DELETE', headers });
      if (!response.ok) {
        return { error: await readError(response, 'Could not delete the show.') };
      }
      set({ events: get().events.filter((event) => event.id !== eventId) });
      return null;
    } catch {
      return { error: OFFLINE };
    }
  },

  removeSeries: async (seriesId) => {
    try {
      const headers = await authHeaders();
      if (!headers) return { error: SIGNED_OUT };

      const response = await fetch(`/api/events/series/${seriesId}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        return { error: await readError(response, 'Could not delete the festival.') };
      }
      const body = await response.json().catch(() => ({}));
      set({ events: get().events.filter((event) => event.seriesId !== seriesId) });
      return { deleted: typeof body.deleted === 'number' ? body.deleted : 0 };
    } catch {
      return { error: OFFLINE };
    }
  },

  upsertLocal: (event) => {
    const events = get().events;
    const index = events.findIndex((entry) => entry.id === event.id);
    if (index === -1) {
      set({ events: [...events, event] });
      return;
    }
    const merged = { ...event, artistName: event.artistName || events[index].artistName };
    set({ events: events.map((entry, position) => (position === index ? merged : entry)) });
  },
}));

function findArtistName(events: readonly ShowEvent[], eventId: string): string {
  return events.find((event) => event.id === eventId)?.artistName || '';
}

/**
 * Forget the signed-in account's shows. Called on SIGNED_OUT (lib/auth-store.ts).
 *
 * This store is module-level, so a client-side navigation to /auth never tears
 * it down: before 2026-09-25, signing out and back in as another account in the
 * same tab painted account A's schedule for account B — and within the 15
 * second freshness window, load() returned early and never replaced it. The
 * recency clock and the in-flight promise go too, so the next load is real.
 */
export function resetEventsStore(): void {
  epoch += 1;
  loadedAt = 0;
  inFlight = null;
  useEventsStore.setState({
    events: [],
    bookableArtistIds: null,
    isInitialLoading: true,
    error: null,
  });
}

// Sign-out: see lib/sign-out-resets.ts (runs from lib/auth-store.ts).
registerSignOutReset('events', resetEventsStore);
