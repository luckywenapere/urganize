// The install offer — "put us on your Home Screen" / "get the app" /
// "install it" (founder request 2026-08-30, retriggered and widened
// 2026-08-31).
//
// THE TRIGGER CHANGED ON 2026-08-31, AND IT IS A CONSCIOUS REVERSAL OF THE
// FOUNDER CALL FROM THE DAY BEFORE, not drift. The original fired once
// someone had opened three DISTINCT surfaces in a session, on the reasoning
// that browsing beats a clock as a signal of intent. The new instruction is
// explicit and simpler — every visit to the web app should offer the install
// after a minute — so the view counting is gone entirely, along with the
// per-navigation sessionStorage write it cost NavigationTracker on the
// shell's hottest effect. Git history has the counting if it is ever wanted
// back; do NOT run it alongside the timer, because two triggers racing
// produce a card whose timing nobody can predict or test.
//
// "EVERY TIME" IS SCOPED TO ONCE PER BROWSER SESSION, and the two halves of
// that are deliberately stored differently:
//   - a DECLINE lives in sessionStorage, so it holds for this visit and the
//     next visit asks again. That is the founder's "every time".
//   - an ACCEPT lives in localStorage for six months, because someone who
//     already took the install must not be asked again tomorrow. On Android
//     especially there is no way back: the app is an APK from the marketing
//     site, and nothing the web page can read will ever tell us it was
//     installed. Six months is the re-ask horizon for the person who tapped
//     the button and never followed through.
// An install we CAN detect ends the offer permanently and by construction —
// isStandaloneDisplay() and isNativePlatform() both resolve the variant to
// null, and the `appinstalled` event marks the accept as well.
//
// THREE PLATFORMS, three different mechanisms, and the differences are not
// cosmetic. iOS can only ever be TAUGHT (Apple routes Add to Home Screen
// through the share sheet; no API on any page can open it). Android gets a
// link to the real APK rather than a second-best web install. Desktop is the
// only one where the browser will actually install for us, via the deferred
// beforeinstallprompt event — and it is offered ONLY when that event has
// genuinely arrived, so the button can never be a control that visibly does
// nothing.
//
// WHY THE ORDER STILL MATTERS, and why it is not merely a nicety on iOS:
// Apple exposes Notification and PushManager ONLY to Home Screen web apps,
// so in an iOS Safari tab isPushSupported() is false and there is no
// notification to ask for. Install first is not a preference there, it is the
// only sequence that can work. Elsewhere both asks are possible and the
// founder's rule applies as written — the notification ask follows a DECLINE.
//
// FAIL DIRECTION — closed, on both counts, and the second one is the subtle
// one. No usable session store means the countdown can never be armed, so the
// card never appears (the cost is silence; Settings still carries every
// switch). It must ALSO mean isInstallPromptOwed() answers false, or the
// notification prompt would be held forever behind an install card that can
// never arrive. That is why isInstallPromptOwed() probes the store with a
// real write rather than trusting a read: Safari's private mode serves
// getItem happily and throws on setItem, so a read-only probe would report a
// store that cannot actually remember anything.

import { readPersistedState, writePersistedState } from './persisted-state';
import { isAndroidBrowser, isIOSBrowser, isNativePlatform, isStandaloneDisplay } from './platform';

/** The founder's number: a minute of looking at the app before it asks. Long
 * enough that someone who opened one page to check a date is gone before it
 * fires, short enough to still be the same visit. */
export const INSTALL_PROMPT_DELAY_MS = 60_000;

/** How long an accept holds. Long, because the cost of re-asking someone who
 * already installed is exactly the nagging this card has to avoid, and on
 * Android nothing the page can read will ever confirm the install for us. */
export const INSTALL_PROMPT_ACCEPTED_MS = 180 * 24 * 60 * 60 * 1000;
export const INSTALL_PROMPT_ACCEPTED_VERSION = 1;

/** Per tab (sessionStorage): the countdown, and whether this visit's one
 * offer has been spent. A fresh visit re-arms — that is what "every time"
 * means here. */
export const INSTALL_PROMPT_STATE_KEY = 'urganize.install-prompt.session';
/** Per browser (localStorage, versioned envelope): "I already took this." */
export const INSTALL_PROMPT_ACCEPTED_KEY = 'urganize.install-prompt.accepted';
/** Written and removed immediately — never read. See the fail-direction note. */
const INSTALL_PROMPT_PROBE_KEY = 'urganize.install-prompt.probe';

/**
 * 'ios' teaches Add to Home Screen (nothing can trigger it — see the card);
 * 'android' points at the real app; 'desktop' runs the browser's own install
 * flow and is offered only when the browser has actually handed us one; null
 * means there is no install to offer at all — an already-installed Home
 * Screen app, the native shell correcting itself, or a browser with no PWA
 * install of any kind (desktop Safari, Firefox).
 */
export type InstallPromptVariant = 'ios' | 'android' | 'desktop' | null;

/** 'accepted' = they took the install (or acknowledged the iOS steps), so the
 * notification ask does NOT follow. 'declined' = "Not now", which is exactly
 * the founder's "if they decide not to install it" branch. */
export type InstallPromptOutcome = 'accepted' | 'declined';

/** armedAt: epoch ms this visit's countdown started. shownAt: epoch ms the
 * card was put on screen — set when it FIRES, not when it is answered, so
 * navigating away from app chrome and back cannot re-offer it. */
export type InstallPromptState = {
  armedAt: number;
  shownAt?: number;
};

export type InstallPromptDecision =
  | { action: 'skip' }
  | { action: 'arm' }
  | { action: 'wait'; remainingMs: number }
  | { action: 'fire' };

const isTrue = (value: unknown): value is true => value === true;

export function isInstallPromptState(value: unknown): value is InstallPromptState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as InstallPromptState;
  if (typeof state.armedAt !== 'number' || !Number.isFinite(state.armedAt)) return false;
  if (state.shownAt !== undefined) {
    if (typeof state.shownAt !== 'number' || !Number.isFinite(state.shownAt)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

/**
 * Which install, if any, this device can be offered.
 *
 * ORDER IS LOAD-BEARING TWICE OVER. The native shell and an installed Home
 * Screen app both mean "already here" and must be answered BEFORE any UA
 * sniffing — an installed iOS Home Screen app is still an iOS user agent and
 * would otherwise be told to install the thing it is running inside. And
 * android must be answered before desktop, because Chrome on Android fires
 * beforeinstallprompt too: reaching the desktop branch there would offer a
 * web install to someone who can have the real app.
 */
export function resolveInstallVariant(input: {
  native: boolean;
  standalone: boolean;
  ios: boolean;
  android: boolean;
  canPromptInstall: boolean;
}): InstallPromptVariant {
  if (input.native || input.standalone) return null;
  if (input.ios) return 'ios';
  if (input.android) return 'android';
  if (input.canPromptInstall) return 'desktop';
  return null;
}

/**
 * The whole gate, pure. 'skip' is terminal for this visit (nothing to offer,
 * already accepted on this device, or this visit's one offer is spent);
 * 'arm' means start the countdown; 'wait' means it is running; 'fire' means
 * put the card up.
 *
 * `shownAt` outranks the clock — once per visit means once. A future
 * `armedAt` (clock skew, hand-edited storage) clamps to a full delay rather
 * than being trusted: a bad clock must never produce an hour-long ambush.
 */
export function decideInstallPrompt(input: {
  state: InstallPromptState | null;
  now: number;
  variant: InstallPromptVariant;
  accepted: boolean;
}): InstallPromptDecision {
  if (input.variant === null) return { action: 'skip' };
  if (input.accepted) return { action: 'skip' };
  if (!input.state) return { action: 'arm' };
  if (input.state.shownAt !== undefined) return { action: 'skip' };

  const elapsed = input.now - input.state.armedAt;
  if (elapsed >= INSTALL_PROMPT_DELAY_MS) return { action: 'fire' };
  const remainingMs = Math.min(
    Math.max(INSTALL_PROMPT_DELAY_MS - elapsed, 0),
    INSTALL_PROMPT_DELAY_MS
  );
  return { action: 'wait', remainingMs };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export function readInstallPromptState(): InstallPromptState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(INSTALL_PROMPT_STATE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isInstallPromptState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Start this visit's countdown. Returns null when the write failed — and on
 * null the caller must NOT set a timer, or it would be running a private
 * countdown that restarts on every mount (the first-release-prompt rule). */
export function armInstallPrompt(now: number): InstallPromptState | null {
  if (typeof window === 'undefined') return null;
  const state: InstallPromptState = { armedAt: now };
  try {
    window.sessionStorage.setItem(INSTALL_PROMPT_STATE_KEY, JSON.stringify(state));
    return state;
  } catch {
    return null;
  }
}

/** Spend this visit's one offer. Best effort: if the write fails the worst
 * case is a second card later in the visit, which is the tolerable direction
 * — the alternative is a card that cannot be dismissed. */
export function markInstallPromptShown(now: number): void {
  if (typeof window === 'undefined') return;
  const state = readInstallPromptState();
  try {
    window.sessionStorage.setItem(
      INSTALL_PROMPT_STATE_KEY,
      JSON.stringify({
        armedAt: state?.armedAt ?? now,
        shownAt: now,
      } satisfies InstallPromptState)
    );
  } catch {
    // Blocked storage. The card is already on screen and answering it still
    // closes it; the cost is that a later remount this visit may re-offer.
  }
}

export function readInstallPromptAccepted(): boolean {
  return (
    readPersistedState(
      INSTALL_PROMPT_ACCEPTED_KEY,
      INSTALL_PROMPT_ACCEPTED_VERSION,
      isTrue,
      INSTALL_PROMPT_ACCEPTED_MS
    ) === true
  );
}

/** Durable, unlike a decline. Guarded because writePersistedState does not
 * wrap setItem, and a throw here must not abandon the settle half-done. */
export function markInstallPromptAccepted(): void {
  try {
    writePersistedState(INSTALL_PROMPT_ACCEPTED_KEY, INSTALL_PROMPT_ACCEPTED_VERSION, true);
  } catch {
    // Storage is unusable. The in-visit sequencing below still holds.
  }
}

/**
 * Can this browser hold the session record at all? A REAL write, because
 * Safari's private mode serves getItem happily and throws on setItem — a
 * read-only probe would report a store that cannot remember anything, and
 * isInstallPromptOwed() would then hold the notification ask behind a card
 * that can never arm.
 */
function isSessionStoreWritable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.sessionStorage.setItem(INSTALL_PROMPT_PROBE_KEY, '1');
    window.sessionStorage.removeItem(INSTALL_PROMPT_PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The browser's own install offer (desktop, and Android Chrome which we
// deliberately do not use it for)
// ---------------------------------------------------------------------------

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredInstallEvent: BeforeInstallPromptEvent | null = null;
let captureStarted = false;

type AvailabilityListener = () => void;
const availabilityListeners = new Set<AvailabilityListener>();

function notifyAvailability(): void {
  availabilityListeners.forEach((listener) => listener());
}

/**
 * Start listening for the browser's install offer.
 *
 * MUST BE CALLED FROM AN EAGERLY-LOADED MODULE. Chrome fires
 * beforeinstallprompt once, shortly after load, and an unlistened event is
 * simply gone — so waiting for the card's own dynamic chunk to resolve is a
 * race we would sometimes lose. NavigationTracker is where it starts, for
 * that reason and no other. Idempotent, so calling it on every route change
 * costs nothing.
 */
export function startInstallPromptCapture(): void {
  if (typeof window === 'undefined' || captureStarted) return;
  captureStarted = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's own mini-infobar: we are about to make this offer
    // ourselves, in our own words, at the moment the founder asked for.
    event.preventDefault();
    deferredInstallEvent = event as BeforeInstallPromptEvent;
    notifyAvailability();
  });

  window.addEventListener('appinstalled', () => {
    // The one install we can actually observe. Record it durably so the card
    // is finished with this device even in browser tabs, where
    // isStandaloneDisplay() stays false.
    deferredInstallEvent = null;
    markInstallPromptAccepted();
    notifyAvailability();
  });
}

export function canPromptDeferredInstall(): boolean {
  return deferredInstallEvent !== null;
}

export function subscribeInstallAvailability(listener: AvailabilityListener): () => void {
  availabilityListeners.add(listener);
  return () => {
    availabilityListeners.delete(listener);
  };
}

/**
 * Run the browser's install flow. One shot by necessity, not by choice:
 * Chrome refuses a second prompt() on the same event, so the reference is
 * dropped before it is used and a repeat call reports 'unavailable' rather
 * than throwing at the user.
 */
export async function promptDeferredInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredInstallEvent;
  if (!event) return 'unavailable';
  deferredInstallEvent = null;
  notifyAvailability();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'unavailable';
  }
}

// ---------------------------------------------------------------------------
// The device read + the notification hand-off
// ---------------------------------------------------------------------------

/** Device capability, read fresh — cheap, and a cached answer would be wrong
 * the moment someone adds us to their Home Screen mid-visit. */
export function resolveDeviceInstallVariant(): InstallPromptVariant {
  return resolveInstallVariant({
    native: isNativePlatform(),
    standalone: isStandaloneDisplay(),
    ios: isIOSBrowser(),
    android: isAndroidBrowser(),
    canPromptInstall: canPromptDeferredInstall(),
  });
}

/**
 * Is an install card still coming this visit? Read by the notification prompt
 * so it holds its own ask until this one has been answered. Callers must gate
 * on the feature flag themselves — this module stays env-free so its tests do
 * not need to stub the build-time constant.
 *
 * Every branch fails toward "not owed", so the notification ask is never
 * muted by an install card that will not arrive. See the fail-direction note
 * at the top for why the last check is a write and not a read.
 */
export function isInstallPromptOwed(): boolean {
  if (resolveDeviceInstallVariant() === null) return false;
  if (readInstallPromptAccepted()) return false;
  if (readInstallPromptState()?.shownAt !== undefined) return false;
  return isSessionStoreWritable();
}

type SettledListener = (outcome: InstallPromptOutcome) => void;
const settledListeners = new Set<SettledListener>();

export function subscribeInstallPromptSettled(listener: SettledListener): () => void {
  settledListeners.add(listener);
  return () => {
    settledListeners.delete(listener);
  };
}

/**
 * Record the answer and release anything waiting on it.
 *
 * THE WRITES ARE GUARDED AND THE NOTIFICATION IS NOT CONDITIONAL ON THEM,
 * deliberately: an unguarded throw would abandon the dismissal half-done —
 * the card would stay up and, worse, the notification prompt waiting on this
 * signal would never be released. Losing the record costs one repeat offer;
 * losing the signal costs the ask entirely.
 */
export function markInstallPromptSettled(outcome: InstallPromptOutcome, now: number): void {
  markInstallPromptShown(now);
  if (outcome === 'accepted') markInstallPromptAccepted();
  settledListeners.forEach((listener) => listener(outcome));
}
