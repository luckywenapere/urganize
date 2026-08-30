// The "you've had a look around — put us on your Home Screen" prompt
// (founder request, 2026-08-30): once someone is observed browsing between
// the app's tabs, offer the install, and only if they turn it down does the
// notification ask follow.
//
// WHY BEHAVIOUR AND NOT A TIMER. The founder's trigger was explicit
// ("when a user is observed to be browsing through the different tabs"), and
// it is the better signal anyway: a timer fires at someone who opened the app
// to check one date, while a third distinct surface in one session is somebody
// actually using the thing. lib/first-release-prompt.ts is the timer-shaped
// sibling; this is the behaviour-shaped one, and they deliberately do not
// share a mechanism because they are answering different questions.
//
// WHY THE ORDER MATTERS, and why it is not merely a nicety on iOS: Apple
// exposes Notification and PushManager ONLY to Home Screen web apps, so in an
// iOS Safari tab isPushSupported() is false and there is no notification to
// ask for. Install first is not a preference there, it is the only sequence
// that can work. On Android and desktop both asks are possible, and the
// founder's rule applies as written — the notification ask follows a DECLINE.
//
// FAIL DIRECTION — closed, on both counts, and the second one is the subtle
// one. Broken storage means the prompt never offers itself (the cost is
// silence, and Settings still carries every switch). It ALSO means
// isInstallPromptOwed() answers false, so a storage failure can never hold
// the notification prompt hostage behind an install prompt that will never
// arrive. Never invert either: an install card that re-appears on every
// navigation is worse than one that never appears, and a permanently muted
// notification ask is worse than both.

import { readPersistedState, writePersistedState } from './persisted-state';
import { isAndroidBrowser, isIOSBrowser, isNativePlatform, isStandaloneDisplay } from './platform';

/** Distinct in-app surfaces in one session before the offer is made. Three,
 * so it is the landing page plus two deliberate moves — enough to mean
 * "looking around", few enough to still be the same visit. */
export const INSTALL_PROMPT_MIN_VIEWS = 3;

/** Let the third view paint before the card slides in. Without it the card
 * lands in the same frame as the tab the user just tapped, which reads as a
 * toll gate on the tap rather than an offer. */
export const INSTALL_PROMPT_DELAY_MS = 1500;

/** How long a "Not now" holds. The push prompt's 30 days, for the same
 * reason it deviates from the AndroidAppBanner "dismissed is forever" rule:
 * a device's situation changes, and this is the difference between
 * notifications being possible on an iPhone and not existing at all. */
export const INSTALL_PROMPT_SETTLE_MS = 30 * 24 * 60 * 60 * 1000;
export const INSTALL_PROMPT_SETTLE_VERSION = 1;

/** Per tab (sessionStorage) — "browsing" is a within-visit observation, and
 * a fresh visit deserves to be judged on its own. */
export const INSTALL_PROMPT_VIEWS_KEY = 'urganize.install-prompt.views';
/** Per browser (localStorage, via persisted-state's versioned envelope) — an
 * answer about THIS device outlives the tab it was given in. */
export const INSTALL_PROMPT_SETTLED_KEY = 'urganize.install-prompt.settled';

/** Guard against a pathological session filling storage; the decision only
 * ever compares against INSTALL_PROMPT_MIN_VIEWS, so nothing needs the tail. */
const MAX_TRACKED_VIEWS = 12;

/** The prefixes that count as "tabs of the app". Deliberately an allow-list:
 * /auth, /onboarding, /start-trial, /locked and the public token pages are
 * flow steps and strangers' pages, and someone bounced through three of them
 * has not browsed anything. */
const COUNTED_PREFIXES = ['/dashboard', '/settings', '/admin'] as const;

/**
 * 'ios' teaches Add to Home Screen (nothing can trigger it — see the card);
 * 'android' points at the real app; null means no install exists to offer:
 * a desktop browser, an already-installed Home Screen app, or the native
 * shell correcting itself.
 */
export type InstallPromptVariant = 'ios' | 'android' | null;

/** 'accepted' = they took the install (or acknowledged the iOS steps), so the
 * notification ask does NOT follow. 'declined' = "Not now", which is exactly
 * the founder's "if they decide not to install it" branch. */
export type InstallPromptOutcome = 'accepted' | 'declined';

export type InstallPromptDecision = 'fire' | 'wait' | 'skip';

const isOutcome = (value: unknown): value is InstallPromptOutcome =>
  value === 'accepted' || value === 'declined';

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

/**
 * The identity of a "tab" for counting purposes, or null when the URL is not
 * one of the app's surfaces.
 *
 * `scene` and `tab` are part of the key because in this app they ARE separate
 * surfaces: ?scene= swaps the whole activity panel for a working surface, and
 * /settings?tab= is a four-way pill row. `release` deliberately is NOT — the
 * catalog scoping to a different release is the same tab showing other
 * contents, and counting it would fire this card at someone flicking through
 * their own releases, which is not "browsing the app".
 */
export function installViewKey(url: string): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return null;

  const queryStart = url.indexOf('?');
  const path = queryStart === -1 ? url : url.slice(0, queryStart);
  if (!COUNTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return null;
  }
  if (queryStart === -1) return path;

  try {
    const params = new URLSearchParams(url.slice(queryStart + 1));
    const facet = params.get('scene') || params.get('tab') || '';
    return facet ? `${path}#${facet}` : path;
  } catch {
    return path;
  }
}

/** Distinct keys, insertion-ordered, capped. Re-visiting a surface already in
 * the list is not new browsing, so it does not move the count. */
export function nextInstallViewList(views: readonly string[], key: string): string[] {
  if (views.includes(key)) return [...views];
  return [...views, key].slice(-MAX_TRACKED_VIEWS);
}

/**
 * Which install, if any, this device can be offered. Order matters: the
 * native shell and an installed Home Screen app both mean "already here",
 * and must be answered before any UA sniffing.
 */
export function resolveInstallVariant(input: {
  native: boolean;
  standalone: boolean;
  ios: boolean;
  android: boolean;
}): InstallPromptVariant {
  if (input.native || input.standalone) return null;
  if (input.ios) return 'ios';
  if (input.android) return 'android';
  return null;
}

/**
 * The whole gate. 'skip' is terminal for this device (no install to offer, or
 * already answered); 'wait' means keep counting; 'fire' means offer it.
 */
export function decideInstallPrompt(input: {
  viewCount: number;
  variant: InstallPromptVariant;
  settled: boolean;
}): InstallPromptDecision {
  if (input.variant === null) return 'skip';
  if (input.settled) return 'skip';
  return input.viewCount >= INSTALL_PROMPT_MIN_VIEWS ? 'fire' : 'wait';
}

// ---------------------------------------------------------------------------
// Storage + the device read
// ---------------------------------------------------------------------------

export function readInstallPromptViews(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(INSTALL_PROMPT_VIEWS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

export function readInstallPromptSettled(): InstallPromptOutcome | null {
  return (
    readPersistedState(
      INSTALL_PROMPT_SETTLED_KEY,
      INSTALL_PROMPT_SETTLE_VERSION,
      isOutcome,
      INSTALL_PROMPT_SETTLE_MS
    ) ?? null
  );
}

/** Device capability, read fresh — cheap, and a cached answer would be wrong
 * the moment an iOS user adds us to their Home Screen mid-session. */
export function resolveDeviceInstallVariant(): InstallPromptVariant {
  return resolveInstallVariant({
    native: isNativePlatform(),
    standalone: isStandaloneDisplay(),
    ios: isIOSBrowser(),
    android: isAndroidBrowser(),
  });
}

/**
 * Is an install prompt still coming on this device? Read by the notification
 * prompt so it holds its own ask until this one has been answered. Callers
 * must gate on the feature flag themselves — this module stays env-free so
 * its tests do not need to stub the build-time constant.
 */
export function isInstallPromptOwed(): boolean {
  return resolveDeviceInstallVariant() !== null && readInstallPromptSettled() === null;
}

// ---------------------------------------------------------------------------
// Notification — two tiny subscriptions rather than a store
// ---------------------------------------------------------------------------
//
// The card is mounted by AppShell and the views are recorded by
// NavigationTracker, which are siblings with no shared render path, and the
// notification prompt is a third. A Zustand store would work; two Sets and a
// module-level array is the smaller thing that does the same job, and it
// matches lib/body-scroll-lock.ts's precedent for cross-component state that
// is not really UI state.

type ViewListener = (views: string[]) => void;
type SettledListener = (outcome: InstallPromptOutcome) => void;

const viewListeners = new Set<ViewListener>();
const settledListeners = new Set<SettledListener>();

export function subscribeInstallPromptViews(listener: ViewListener): () => void {
  viewListeners.add(listener);
  return () => {
    viewListeners.delete(listener);
  };
}

export function subscribeInstallPromptSettled(listener: SettledListener): () => void {
  settledListeners.add(listener);
  return () => {
    settledListeners.delete(listener);
  };
}

/** Record one in-app surface. A no-op for URLs that are not app tabs, and for
 * surfaces already seen this session. */
export function recordInstallPromptView(url: string): void {
  if (typeof window === 'undefined') return;
  const key = installViewKey(url);
  if (!key) return;

  const views = readInstallPromptViews();
  const next = nextInstallViewList(views, key);
  if (next.length === views.length) return;

  try {
    window.sessionStorage.setItem(INSTALL_PROMPT_VIEWS_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: the count can never reach the threshold, so the card
    // never offers itself and the notification prompt is never held for it
    // (isInstallPromptOwed reads the same broken store and answers false).
    return;
  }
  viewListeners.forEach((listener) => listener(next));
}

/**
 * Record the answer for this device and release anything waiting on it.
 *
 * THE WRITE IS GUARDED AND THE NOTIFICATION IS NOT CONDITIONAL ON IT, which
 * is the opposite of recordInstallPromptView above and deliberate.
 * writePersistedState does not wrap setItem, so a full quota or Safari's
 * private mode throws here — and an unguarded throw would abandon the
 * dismissal half-done: the card would stay up and, worse, the notification
 * prompt waiting on this signal would never be released. Losing the record
 * costs one repeat offer next session; losing the signal costs the ask
 * entirely.
 */
export function markInstallPromptSettled(outcome: InstallPromptOutcome): void {
  try {
    writePersistedState(INSTALL_PROMPT_SETTLED_KEY, INSTALL_PROMPT_SETTLE_VERSION, outcome);
  } catch {
    // Storage is unusable. The in-session sequencing below still holds.
  }
  settledListeners.forEach((listener) => listener(outcome));
}
