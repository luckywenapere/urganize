// Microsoft Clarity: heatmaps and session recordings, beside PostHog
// (2026-10-18, founder asked for Clarity on app.urganize.app).
//
// Same rules as PostHog:
// - Loads after the page is usable (window load + idle), never during
//   hydration, so it costs slow phones nothing on first paint.
// - Our own and test accounts are never recorded (2026-10-16, "any account you
//   are using is excluded from the analytics"). Once a browser signs in as one
//   of us it is remembered as internal, Clarity stops, and it never loads there
//   again, signed in or out. A real account on that browser clears the mark.

import { isInternalAccountEmail } from '@/lib/internal-accounts';

const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || 'yzov1zloyv';
const INTERNAL_BROWSER_KEY = 'urganize.analytics.internal-browser';

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };
type ClarityWindow = Window & {
  clarity?: ClarityFn;
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

let loadRequested = false;

function isInternalBrowser(): boolean {
  try {
    return window.localStorage.getItem(INTERNAL_BROWSER_KEY) === '1';
  } catch {
    return false;
  }
}

function setInternalBrowser(internal: boolean) {
  try {
    if (internal) window.localStorage.setItem(INTERNAL_BROWSER_KEY, '1');
    else window.localStorage.removeItem(INTERNAL_BROWSER_KEY);
  } catch {
    // Private mode: nothing to remember.
  }
}

/** Calls are queued until the tag arrives, the way Clarity's own snippet does. */
function clarity(...args: unknown[]) {
  const w = window as ClarityWindow;
  if (!w.clarity) {
    const queued: ClarityFn = (...queuedArgs: unknown[]) => {
      (queued.q = queued.q || []).push(queuedArgs);
    };
    w.clarity = queued;
  }
  w.clarity(...args);
}

function injectTag() {
  if (isInternalBrowser()) return;
  if (document.getElementById('ms-clarity')) return;
  clarity('set', 'app', 'web');
  const script = document.createElement('script');
  script.id = 'ms-clarity';
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
  document.head.appendChild(script);
}

/** Starts Clarity once per page life, after load and idle. */
export function loadClarity() {
  if (typeof window === 'undefined' || loadRequested) return;
  if (!CLARITY_PROJECT_ID || CLARITY_PROJECT_ID.length < 4) return;
  if (process.env.NODE_ENV !== 'production') return;
  if (isInternalBrowser()) return;
  loadRequested = true;

  const idle = () => {
    const w = window as ClarityWindow;
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(injectTag, { timeout: 3_000 });
    } else {
      window.setTimeout(injectTag, 500);
    }
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

export function identifyClarityUser(user: { id?: string | null; email?: string | null; role?: string | null } | null | undefined) {
  if (typeof window === 'undefined' || !user?.id) return;

  if (isInternalAccountEmail(user.email)) {
    setInternalBrowser(true);
    const w = window as ClarityWindow;
    if (w.clarity) w.clarity('stop');
    return;
  }

  if (isInternalBrowser()) {
    setInternalBrowser(false);
    loadClarity();
  }
  if (!(window as ClarityWindow).clarity && !loadRequested) return;
  clarity('identify', user.id);
  if (user.role) clarity('set', 'role', user.role);
}
