'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { Entitlements } from '@/lib/entitlements';

// Client-side mirror of the server entitlement check (URG-178). This is the
// SECOND layer only — every gated route enforces the real 403 server-side
// regardless of what this store says. This exists purely so the UI can show
// an upsell instead of a dead click/unexplained error, and so nav items know
// whether to route to the real feature or the upsell.
type EntitlementsStore = {
  entitlements: Entitlements | null;
  isLoading: boolean;
  load: () => Promise<void>;
};

const getAccessToken = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
};

export const useEntitlementsStore = create<EntitlementsStore>((set, get) => ({
  entitlements: null,
  isLoading: false,
  load: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        set({ isLoading: false });
        return;
      }
      const response = await fetch('/api/entitlements', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        set({ isLoading: false });
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        entitlements?: Entitlements;
      } | null;
      if (payload?.entitlements) {
        set({ entitlements: payload.entitlements, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
