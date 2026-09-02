'use client';

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
 * The event DETAIL screen deliberately does not live here. Its state (run of
 * show, setlists, items) is used by exactly one page, so a global store would
 * add coordination for no sharing.
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

type EventsStore = {
  events: ShowEvent[];
  /** True until the first load settles, so a later visit renders rows rather
   *  than a skeleton. */
  isInitialLoading: boolean;
  error: string | null;
  load: (options?: { force?: boolean }) => Promise<void>;
  create: (input: CreateShowInput) => Promise<{ event: ShowEvent } | { error: string }>;
  createSeries: (input: CreateSeriesInput) => Promise<{ events: ShowEvent[] } | { error: string }>;
  remove: (eventId: string) => Promise<{ error: string } | null>;
};

// Recency guard + in-flight coalescing, mirroring useNotesStore. Mutations
// pass { force: true } when they need server truth back.
const EVENTS_FRESH_MS = 15_000;
let loadedAt = 0;
let inFlight: Promise<void> | null = null;

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

export const useEventsStore = create<EventsStore>((set, get) => ({
  events: [],
  isInitialLoading: true,
  error: null,

  load: async (options) => {
    const force = options?.force === true;
    if (!force && inFlight) return inFlight;
    if (!force && Date.now() - loadedAt < EVENTS_FRESH_MS && get().events.length > 0) {
      return;
    }

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
        loadedAt = Date.now();
        set({
          events: Array.isArray(body.events) ? body.events : [],
          error: null,
          isInitialLoading: false,
        });
      } catch {
        // A dropped connection is the common case on the networks this product
        // runs on. Surface it rather than rejecting into an unhandled promise.
        set({ error: 'Could not reach the server. Check your connection.', isInitialLoading: false });
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
      if (!headers) return { error: 'You are signed out. Sign in and try again.' };

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
      return { error: 'Could not reach the server. Check your connection.' };
    }
  },

  createSeries: async (input) => {
    try {
      const headers = await authHeaders();
      if (!headers) return { error: 'You are signed out. Sign in and try again.' };

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
      return { error: 'Could not reach the server. Check your connection.' };
    }
  },

  remove: async (eventId) => {
    try {
      const headers = await authHeaders();
      if (!headers) return { error: 'You are signed out. Sign in and try again.' };

      const response = await fetch(`/api/events/${eventId}`, { method: 'DELETE', headers });
      if (!response.ok) {
        return { error: await readError(response, 'Could not delete the show.') };
      }
      set({ events: get().events.filter((event) => event.id !== eventId) });
      return null;
    } catch {
      return { error: 'Could not reach the server. Check your connection.' };
    }
  },
}));
