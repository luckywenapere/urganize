'use client';

import { registerSignOutReset } from '@/lib/sign-out-resets';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { OpportunityView } from '@/lib/opportunities';

/** What a form sends. Loose on purpose: the server validates and parses every field. */
type OpportunityInput = Record<string, unknown>;

/**
 * The team's opportunities.
 *
 * Memory only, no localStorage copy: these rows hold names of deals, brands and
 * money, and localStorage outlives a sign-out on a shared machine. Reset on
 * sign-out, with an epoch so a load still on the wire when the account changes
 * cannot land under the next account (the useRelationshipsStore pattern).
 */

type OpportunitiesStore = {
  opportunities: OpportunityView[];
  /** True until the first load settles, so a later visit shows rows not a skeleton. */
  isInitialLoading: boolean;
  error: string | null;
  load: (options?: { force?: boolean }) => Promise<void>;
  create: (input: OpportunityInput) => Promise<{ error: string } | null>;
  update: (id: string, patch: OpportunityInput) => Promise<{ error: string } | null>;
  remove: (id: string) => Promise<{ error: string } | null>;
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

export const useOpportunitiesStore = create<OpportunitiesStore>((set, get) => ({
  opportunities: [],
  isInitialLoading: true,
  error: null,

  load: async (options) => {
    const force = options?.force === true;
    if (!force && inFlight) return inFlight;
    if (!force && Date.now() - loadedAt < FRESH_MS && get().opportunities.length > 0) return;

    const startedIn = epoch;
    const run = (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) {
          if (startedIn === epoch) set({ isInitialLoading: false });
          return;
        }
        const response = await fetch('/api/opportunities', { headers, cache: 'no-store' });
        if (startedIn !== epoch) return;
        if (!response.ok) {
          set({
            isInitialLoading: false,
            error: await readError(response, 'Could not load your opportunities.'),
          });
          return;
        }
        const body = (await response.json().catch(() => null)) as { opportunities?: OpportunityView[] } | null;
        if (startedIn !== epoch) return;
        set({
          opportunities: Array.isArray(body?.opportunities) ? body.opportunities : [],
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
      const response = await fetch('/api/opportunities', {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
      if (!response.ok) return { error: await readError(response, 'Could not add that opportunity.') };
      const body = (await response.json()) as { opportunity: OpportunityView };
      set((state) => ({ opportunities: [body.opportunity, ...state.opportunities] }));
      return null;
    } catch {
      return { error: OFFLINE };
    }
  },

  update: async (id, patch) => {
    const headers = await authHeaders();
    if (!headers) return { error: SIGNED_OUT };
    try {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      if (!response.ok) return { error: await readError(response, 'Could not save that.') };
      const body = (await response.json()) as { opportunity: OpportunityView };
      set((state) => ({
        opportunities: state.opportunities.map((item) => (item.id === id ? body.opportunity : item)),
      }));
      return null;
    } catch {
      return { error: OFFLINE };
    }
  },

  remove: async (id) => {
    const headers = await authHeaders();
    if (!headers) return { error: SIGNED_OUT };
    try {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) return { error: await readError(response, 'Could not remove that opportunity.') };
      set((state) => ({ opportunities: state.opportunities.filter((item) => item.id !== id) }));
      return null;
    } catch {
      return { error: OFFLINE };
    }
  },
}));

/** Called on sign-out. Bumps the epoch so a load already on the wire cannot land. */
export function resetOpportunitiesStore(): void {
  epoch += 1;
  loadedAt = 0;
  inFlight = null;
  useOpportunitiesStore.setState({ opportunities: [], isInitialLoading: true, error: null });
}

// Sign-out: see lib/sign-out-resets.ts (runs from lib/auth-store.ts).
registerSignOutReset('opportunities', resetOpportunitiesStore);
