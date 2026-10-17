'use client';

import { registerSignOutReset } from '@/lib/sign-out-resets';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { DuplicateFlagView, InteractionView, RelationshipView } from '@/lib/relationships-server';
import type { RelationshipPatch } from '@/lib/relationships';

/**
 * The team's contacts (Relationships, Phase 2).
 *
 * Deliberately NO localStorage cache, unlike notes: this holds other people's
 * names, emails and phone numbers, and localStorage is readable by any script on
 * the origin and outlives a sign-out on a shared machine. The same call the fan
 * capture scene makes about leads. Memory only, and reset on sign-out.
 *
 * Recency guard, in-flight coalescing and a sign-out epoch: a load still on the wire when the account changes checks the
 * epoch before committing, so one account's contacts can never land under
 * another's.
 */

type CreateInput = {
  label: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
};

type CreateResult =
  | { personId: string; created: boolean; alreadyKnown: boolean; flagged: number }
  | { error: string };

type RelationshipsStore = {
  relationships: RelationshipView[];
  flags: DuplicateFlagView[];
  /** The short log on each person's page, keyed by person id, loaded on open. */
  interactions: Record<string, InteractionView[]>;
  /** True until the first load settles, so a later visit shows rows not a skeleton. */
  isInitialLoading: boolean;
  error: string | null;
  load: (options?: { force?: boolean }) => Promise<void>;
  create: (input: CreateInput) => Promise<CreateResult>;
  update: (personId: string, patch: RelationshipPatch) => Promise<{ error: string } | null>;
  remove: (personId: string) => Promise<{ error: string } | null>;
  dismissFlag: (flagId: string) => Promise<{ error: string } | null>;
  loadInteractions: (personId: string) => Promise<void>;
  logInteraction: (personId: string, body: string) => Promise<{ error: string } | null>;
};

const FRESH_MS = 15_000;
let loadedAt = 0;
let inFlight: Promise<void> | null = null;
let epoch = 0;

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

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

export const useRelationshipsStore = create<RelationshipsStore>((set, get) => ({
  relationships: [],
  flags: [],
  interactions: {},
  isInitialLoading: true,
  error: null,

  load: async (options) => {
    const force = options?.force === true;
    if (!force && inFlight) return inFlight;
    if (!force && Date.now() - loadedAt < FRESH_MS && get().relationships.length > 0) return;

    const startedIn = epoch;
    const run = (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) {
          if (startedIn === epoch) set({ isInitialLoading: false });
          return;
        }
        const [listResponse, flagResponse] = await Promise.all([
          fetch('/api/relationships', { headers, cache: 'no-store' }),
          fetch('/api/relationships/duplicates', { headers, cache: 'no-store' }),
        ]);
        if (startedIn !== epoch) return;
        if (!listResponse.ok) {
          set({
            isInitialLoading: false,
            error: await readError(listResponse, 'Could not load your contacts.'),
          });
          return;
        }
        const list = (await listResponse.json().catch(() => null)) as { relationships?: RelationshipView[] } | null;
        const flagBody = flagResponse.ok
          ? ((await flagResponse.json().catch(() => null)) as { flags?: DuplicateFlagView[] } | null)
          : null;
        if (startedIn !== epoch) return;
        set({
          relationships: Array.isArray(list?.relationships) ? list.relationships : [],
          // Suggestions are a nicety. If they fail to load the list is still right.
          flags: Array.isArray(flagBody?.flags) ? flagBody.flags : [],
          isInitialLoading: false,
          error: null,
        });
        loadedAt = Date.now();
      } catch {
        if (startedIn === epoch) set({ isInitialLoading: false, error: OFFLINE });
      }
    })();

    inFlight = run;
    try {
      await run;
    } finally {
      if (inFlight === run) inFlight = null;
    }
  },

  create: async (input) => {
    const headers = await authHeaders();
    if (!headers) return { error: SIGNED_OUT };
    try {
      const response = await fetch('/api/relationships', {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
      if (!response.ok) return { error: await readError(response, 'Could not add that contact.') };
      const body = (await response.json()) as {
        personId: string;
        created: boolean;
        alreadyKnown: boolean;
        flagged: number;
      };
      await get().load({ force: true });
      return body;
    } catch {
      return { error: OFFLINE };
    }
  },

  update: async (personId, patch) => {
    const headers = await authHeaders();
    if (!headers) return { error: SIGNED_OUT };
    try {
      const response = await fetch(`/api/relationships/${encodeURIComponent(personId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      if (!response.ok) return { error: await readError(response, 'Could not save that.') };
      const body = (await response.json()) as { relationship: RelationshipView };
      set((state) => ({
        relationships: state.relationships.map((item) =>
          item.personId === personId ? body.relationship : item
        ),
      }));
      return null;
    } catch {
      return { error: OFFLINE };
    }
  },

  remove: async (personId) => {
    const headers = await authHeaders();
    if (!headers) return { error: SIGNED_OUT };
    try {
      const response = await fetch(`/api/relationships/${encodeURIComponent(personId)}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) return { error: await readError(response, 'Could not remove that contact.') };
      set((state) => ({
        relationships: state.relationships.filter((item) => item.personId !== personId),
        // The server drops flags about a removed contact; mirror it.
        flags: state.flags.filter((flag) => flag.a.personId !== personId && flag.b.personId !== personId),
      }));
      return null;
    } catch {
      return { error: OFFLINE };
    }
  },

  loadInteractions: async (personId) => {
    const startedIn = epoch;
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const response = await fetch(`/api/relationships/${encodeURIComponent(personId)}`, {
        headers,
        cache: 'no-store',
      });
      if (!response.ok || startedIn !== epoch) return;
      const body = (await response.json().catch(() => null)) as {
        relationship?: RelationshipView;
        interactions?: InteractionView[];
      } | null;
      if (startedIn !== epoch || !body) return;
      set((state) => ({
        interactions: {
          ...state.interactions,
          [personId]: Array.isArray(body.interactions) ? body.interactions : [],
        },
        relationships: body.relationship
          ? state.relationships.some((item) => item.personId === personId)
            ? state.relationships.map((item) => (item.personId === personId ? body.relationship! : item))
            : [...state.relationships, body.relationship]
          : state.relationships,
      }));
    } catch {
      // The log is a nicety on the page; the person still shows.
    }
  },

  logInteraction: async (personId, text) => {
    const headers = await authHeaders();
    if (!headers) return { error: SIGNED_OUT };
    try {
      const response = await fetch(`/api/relationships/${encodeURIComponent(personId)}/interactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: text }),
      });
      if (!response.ok) return { error: await readError(response, 'Could not save that.') };
      const body = (await response.json()) as { interaction: InteractionView; lastContactAt: string };
      set((state) => ({
        interactions: {
          ...state.interactions,
          [personId]: [body.interaction, ...(state.interactions[personId] ?? [])],
        },
        relationships: state.relationships.map((item) =>
          item.personId === personId ? { ...item, lastContactAt: body.lastContactAt } : item
        ),
      }));
      return null;
    } catch {
      return { error: OFFLINE };
    }
  },

  dismissFlag: async (flagId) => {
    const headers = await authHeaders();
    if (!headers) return { error: SIGNED_OUT };
    try {
      const response = await fetch(`/api/relationships/duplicates/${encodeURIComponent(flagId)}`, {
        method: 'POST',
        headers,
      });
      if (!response.ok) return { error: await readError(response, 'Could not save that.') };
      set((state) => ({ flags: state.flags.filter((flag) => flag.id !== flagId) }));
      return null;
    } catch {
      return { error: OFFLINE };
    }
  },
}));

/** Called on sign-out. Bumps the epoch so a load already on the wire cannot land. */
export function resetRelationshipsStore(): void {
  epoch += 1;
  loadedAt = 0;
  inFlight = null;
  useRelationshipsStore.setState({
    relationships: [],
    flags: [],
    interactions: {},
    isInitialLoading: true,
    error: null,
  });
}

// Sign-out: see lib/sign-out-resets.ts (runs from lib/auth-store.ts).
registerSignOutReset('relationships', resetRelationshipsStore);
