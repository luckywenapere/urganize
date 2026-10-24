'use client';

import { registerSignOutReset } from '@/lib/sign-out-resets';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { DuplicateFlagView, InteractionView, RelationshipView } from '@/lib/relationships-server';
import type { RelationshipPatch } from '@/lib/relationships';
import type { VouchView, WorkedTogetherRow } from '@/lib/vouches';

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

  // ── Vouch, slice 1 ──
  /** Task id to the person from My People on it ("Who's doing it"). */
  assignments: Record<string, string>;
  /** Loads the team's assignments. Coalesced, and skipped while fresh. */
  loadAssignments: (options?: { force?: boolean }) => Promise<void>;
  /** Sets who is doing an activity, or nobody. Optimistic; rolls back on failure. */
  assignPerson: (taskId: string, personId: string | null) => Promise<{ error: string } | null>;
  /** "Worked together" and the team's vouches, per person, loaded on the person page. */
  work: Record<string, { workedTogether: WorkedTogetherRow[]; vouches: VouchView[] }>;
  loadWork: (personId: string) => Promise<void>;
  saveVouch: (
    personId: string,
    input: { skill: string; note?: string; taskId?: string | null }
  ) => Promise<{ error: string } | null>;
};

const FRESH_MS = 15_000;
let loadedAt = 0;
let inFlight: Promise<void> | null = null;
let epoch = 0;
let assignmentsLoadedAt = 0;
let assignmentsInFlight: Promise<void> | null = null;

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
  assignments: {},
  work: {},

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

  loadAssignments: async (options) => {
    const force = options?.force === true;
    if (!force && assignmentsInFlight) return assignmentsInFlight;
    if (!force && Date.now() - assignmentsLoadedAt < FRESH_MS) return;
    const startedIn = epoch;
    const run = (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const response = await fetch('/api/relationships/assignments', { headers, cache: 'no-store' });
        // Off, limited to one artist, or not ready: no prompt, nothing else changes.
        if (!response.ok || startedIn !== epoch) return;
        const body = (await response.json().catch(() => null)) as {
          assignments?: Array<{ taskId: string; personId: string }>;
        } | null;
        if (startedIn !== epoch || !Array.isArray(body?.assignments)) return;
        const next: Record<string, string> = {};
        for (const item of body.assignments) if (item.taskId && item.personId) next[item.taskId] = item.personId;
        set({ assignments: next });
        assignmentsLoadedAt = Date.now();
      } catch {
        // The vouch prompt is a nicety; ticking still works.
      }
    })();
    assignmentsInFlight = run;
    try {
      await run;
    } finally {
      if (assignmentsInFlight === run) assignmentsInFlight = null;
    }
  },

  assignPerson: async (taskId, personId) => {
    const headers = await authHeaders();
    if (!headers) return { error: SIGNED_OUT };
    const before = get().assignments[taskId] ?? null;
    const apply = (value: string | null) =>
      set((state) => {
        const next = { ...state.assignments };
        if (value) next[taskId] = value;
        else delete next[taskId];
        return { assignments: next };
      });
    apply(personId);
    try {
      const response = await fetch(`/api/relationships/assignments/${encodeURIComponent(taskId)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ personId }),
      });
      if (!response.ok) {
        apply(before);
        return { error: await readError(response, 'Could not save that.') };
      }
      // "Worked together" changes for both people; read it again next time.
      set((state) => {
        const work = { ...state.work };
        if (before) delete work[before];
        if (personId) delete work[personId];
        return { work };
      });
      return null;
    } catch {
      apply(before);
      return { error: OFFLINE };
    }
  },

  loadWork: async (personId) => {
    const startedIn = epoch;
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const response = await fetch(`/api/relationships/${encodeURIComponent(personId)}/vouches`, {
        headers,
        cache: 'no-store',
      });
      if (!response.ok || startedIn !== epoch) return;
      const body = (await response.json().catch(() => null)) as {
        workedTogether?: WorkedTogetherRow[];
        vouches?: VouchView[];
      } | null;
      if (startedIn !== epoch || !body) return;
      set((state) => ({
        work: {
          ...state.work,
          [personId]: {
            workedTogether: Array.isArray(body.workedTogether) ? body.workedTogether : [],
            vouches: Array.isArray(body.vouches) ? body.vouches : [],
          },
        },
      }));
    } catch {
      // Both sections are extras on the page; the person still shows.
    }
  },

  saveVouch: async (personId, input) => {
    const headers = await authHeaders();
    if (!headers) return { error: SIGNED_OUT };
    try {
      const response = await fetch(`/api/relationships/${encodeURIComponent(personId)}/vouches`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
      if (!response.ok) return { error: await readError(response, 'Could not save that.') };
      const body = (await response.json()) as { vouch: VouchView };
      set((state) => {
        const current = state.work[personId];
        if (!current) return state;
        const key = body.vouch.skill.toLowerCase();
        return {
          work: {
            ...state.work,
            [personId]: {
              ...current,
              vouches: [body.vouch, ...current.vouches.filter((item) => item.skill.toLowerCase() !== key)],
            },
          },
        };
      });
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
  assignmentsLoadedAt = 0;
  assignmentsInFlight = null;
  useRelationshipsStore.setState({
    relationships: [],
    flags: [],
    interactions: {},
    assignments: {},
    work: {},
    isInitialLoading: true,
    error: null,
  });
}

// Sign-out: see lib/sign-out-resets.ts (runs from lib/auth-store.ts).
registerSignOutReset('relationships', resetRelationshipsStore);
