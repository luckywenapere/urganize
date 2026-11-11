'use client';

import { create } from 'zustand';
import { registerSignOutReset } from '@/lib/sign-out-resets';
import { supabase } from '@/lib/supabase/client';
import {
  HOME_LAYOUT_KEY,
  HOME_LAYOUT_SCOPE,
  isDefaultLayout,
  readLayout,
  toPayload,
  type HomeLayout,
} from '@/lib/home-desktop/layout';

// One person's Home layout (#1182). Read once per page life from the per-user
// draft store (/api/ui-drafts, table ui_state_drafts) and written when the
// person presses Done. Fails open: any failure to read leaves the default
// layout, so Home always draws.

type HomeLayoutStore = {
  layout: HomeLayout;
  /** True once the first read has settled, well or badly. */
  loaded: boolean;
  load: () => Promise<void>;
  /** Keeps the layout on screen and saves it. False when the save failed. */
  save: (layout: HomeLayout) => Promise<boolean>;
};

const fresh = (): HomeLayout => readLayout(null);
const ENDPOINT = '/api/ui-drafts';
const QUERY = `scope=${HOME_LAYOUT_SCOPE}&draftKey=${HOME_LAYOUT_KEY}`;

let inFlight: Promise<void> | null = null;
// Bumped on sign-out: a read that started for the last account is dropped
// instead of landing on the next one.
let account = 0;

async function token(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  } catch {
    return '';
  }
}

export const useHomeLayoutStore = create<HomeLayoutStore>((set, get) => ({
  layout: fresh(),
  loaded: false,
  load: () => {
    if (get().loaded) return Promise.resolve();
    if (inFlight) return inFlight;
    const mine = account;
    inFlight = (async () => {
      try {
        const accessToken = await token();
        if (!accessToken) return;
        const response = await fetch(`${ENDPOINT}?${QUERY}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = (await response.json()) as { draft?: { payload?: unknown } | null };
        // A save made while this read was in the air wins.
        if (mine === account && !get().loaded) set({ layout: readLayout(body.draft?.payload ?? null) });
      } catch {
        // The default layout stays.
      } finally {
        if (mine === account) {
          set({ loaded: true });
          inFlight = null;
        }
      }
    })();
    return inFlight;
  },
  save: async (layout) => {
    set({ layout, loaded: true });
    try {
      const accessToken = await token();
      if (!accessToken) return false;
      const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
      // The default needs no row: Reset clears it, so later defaults reach this person.
      const response = isDefaultLayout(layout)
        ? await fetch(`${ENDPOINT}?${QUERY}`, { method: 'DELETE', headers })
        : await fetch(ENDPOINT, {
            method: 'POST',
            headers,
            body: JSON.stringify({ scope: HOME_LAYOUT_SCOPE, draftKey: HOME_LAYOUT_KEY, payload: toPayload(layout) }),
          });
      return response.ok;
    } catch {
      return false;
    }
  },
}));

registerSignOutReset('home-layout', () => {
  account += 1;
  inFlight = null;
  useHomeLayoutStore.setState({ layout: fresh(), loaded: false });
});
