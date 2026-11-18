'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { registerSignOutReset } from '@/lib/sign-out-resets';
import {
  SWIPE_NAV_MEDIA_QUERY,
  SWIPE_NAV_METADATA_KEY,
  SWIPE_NAV_QUERY_KEY,
  shouldShowSwipeNav,
  readSwipeNavQuery,
  resolveSwipeNav,
  type SwipeTabKey,
} from '@/lib/swipe-nav';

// The swipe navigation's switch and its shared state (URG-380).
//
// THE SWITCH. On for everyone by default (Oyin, Oct 19, 2026). A person opts
// out with ?nav=classic on any app page (written to their auth
// user_metadata.swipe_nav as false; ?nav=swipe turns it back on), or by setting
// swipe_nav: false in the Supabase dashboard. NEXT_PUBLIC_FEATURE_SWIPE_NAV set
// to 'false' is the kill switch: classic nav for everyone (a build flag, so a
// deploy).
//
// The answer is cached in localStorage per user so a reload draws the right
// chrome as soon as the browser takes over, then confirmed against the
// session. The server always renders the old chrome (it cannot know), which is
// the same frame the auth skeleton already shows.

const ALL_OFF = process.env.NEXT_PUBLIC_FEATURE_SWIPE_NAV === 'false';
const CACHE_KEY = 'urganize.swipe-nav.v1';

type Handoff = {
  /** The Home card this came from; a repeat tap does not add it twice. */
  cardId: string;
  title: string;
  body: string;
  actionLabel: string | null;
  /** Runs the card's own action. */
  onAction: (() => void) | null;
  /** "Not now": the card's own dismiss. */
  onDismiss: (() => void) | null;
  at: number;
};

type SwipeNavState = {
  /** On by default; an opted-out account turns it off once the session is read. */
  enabled: boolean | null;
  /** Open sheets that freeze the pager (sessions, avatar, connections). */
  locks: number;
  /** The pager's own "go to this tab", registered while it is mounted. */
  go: ((key: SwipeTabKey, options?: { instant?: boolean }) => void) | null;
  /** The Home card carried into Main, newest turn, until acted on or put away. */
  handoff: Handoff | null;
  /** Home is drawing its own box to ask AI (#1339), so the pinned box steps
   *  aside on that tab. Set by the box itself while it is mounted, so the two
   *  can never disagree (an artist's own Home draws none). */
  homeAsk: boolean;
  setHomeAsk: (value: boolean) => void;
  setEnabled: (value: boolean) => void;
  lock: () => () => void;
  setGo: (go: SwipeNavState['go']) => void;
  setHandoff: (handoff: Handoff | null) => void;
};

export const useSwipeNavStore = create<SwipeNavState>((set, get) => ({
  enabled: !ALL_OFF,
  locks: 0,
  go: null,
  handoff: null,
  homeAsk: false,
  setHomeAsk: (value) => set({ homeAsk: value }),
  setEnabled: (value) => set({ enabled: ALL_OFF ? false : value }),
  lock: () => {
    set({ locks: get().locks + 1 });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      set({ locks: Math.max(0, get().locks - 1) });
    };
  },
  setGo: (go) => set({ go }),
  setHandoff: (handoff) => set({ handoff }),
}));

registerSignOutReset('swipe-nav', () => {
  useSwipeNavStore.setState({ enabled: !ALL_OFF, handoff: null });
});

function readCache(userId: string): boolean | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { u?: string; on?: boolean };
    return parsed.u === userId && typeof parsed.on === 'boolean' ? parsed.on : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, on: boolean) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ u: userId, on }));
  } catch {
    // Storage full or blocked: the session read still decides.
  }
}

let started = false;

/**
 * Reads the switch once per page load: the cache first, then the session, then
 * a ?nav= request. Safe to call from many components; only the first runs.
 */
export function startSwipeNav(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (ALL_OFF) {
    useSwipeNavStore.getState().setEnabled(false);
    return;
  }
  void (async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      useSwipeNavStore.getState().setEnabled(false);
      return;
    }
    const cached = readCache(user.id);
    if (cached !== null) useSwipeNavStore.getState().setEnabled(cached);
    let on = resolveSwipeNav({ allOff: ALL_OFF, metadata: user.user_metadata });

    const params = new URLSearchParams(window.location.search);
    const asked = readSwipeNavQuery(params.get(SWIPE_NAV_QUERY_KEY));
    if (asked !== null && asked !== on) {
      const { error } = await supabase.auth.updateUser({ data: { [SWIPE_NAV_METADATA_KEY]: asked } });
      if (!error) on = asked;
    }
    if (asked !== null) {
      params.delete(SWIPE_NAV_QUERY_KEY);
      const query = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
    writeCache(user.id, on);
    useSwipeNavStore.getState().setEnabled(on);
  })();

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) return;
    if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
      const on = resolveSwipeNav({ allOff: ALL_OFF, metadata: session.user.user_metadata });
      writeCache(session.user.id, on);
      useSwipeNavStore.getState().setEnabled(on);
    }
  });
}

const subscribe = (listener: () => void) => useSwipeNavStore.subscribe(listener);

// The viewport half of the gate: phone width (below lg, 1024px) or not. Read
// straight from matchMedia, so the first client render already knows and a
// desktop never draws the swipe shell; a window resized across the breakpoint
// re-renders through the media query's change event.
function phoneWidthQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(SWIPE_NAV_MEDIA_QUERY);
}

function subscribeViewport(listener: () => void) {
  const query = phoneWidthQuery();
  if (!query) return () => {};
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }
  // Safari before 14.
  query.addListener(listener);
  return () => query.removeListener(listener);
}

function isPhoneWidth(): boolean {
  return phoneWidthQuery()?.matches === true;
}

/** True on a phone-width screen (below lg). False on the server and in the hydration render. */
export function usePhoneWidth(): boolean {
  return useSyncExternalStore(subscribeViewport, isPhoneWidth, () => false);
}

/**
 * True when the swipe navigation is drawn: on for this person AND a phone-width
 * screen. False on the server and in the hydration render (so the server's
 * HTML always matches, and desktop starts and stays classic), then the real
 * answer.
 */
export function useSwipeNav(): boolean {
  const enabled = useSyncExternalStore(
    subscribe,
    () => useSwipeNavStore.getState().enabled === true,
    () => false
  );
  const phoneWidth = usePhoneWidth();
  return shouldShowSwipeNav({ enabled, phoneWidth });
}
