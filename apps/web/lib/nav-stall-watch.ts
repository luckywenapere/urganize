import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { useAuthStore } from '@/lib/auth-store';
import {
  NAV_RECOVER_MS,
  NAV_STALL_MS,
  allowRecovery,
  allowStallReport,
  describeConnection,
  didNavigate,
  isDuplicateNavClick,
  routerJustReceived,
  type PendingNav,
  linkClickTarget,
  resolveRecoverTarget,
  shouldRecover,
  shouldReportStall,
  type NavStallLabel,
} from '@/lib/nav-stall';

// Module state is per page load, which is the right lifetime for a rate limit:
// a reload is a fresh start.
const recentReports: Array<{ at: number; label: string }> = [];
let lastRecoveryAt: number | null = null;

// The newest watched tap. Only the newest may recover: a tap on A followed by a
// tap on B must never hard-load A seven seconds later.
let generation = 0;
let pending: PendingNav | null = null;
let pendingPoll: number | null = null;
const pendingListeners = new Set<(isPending: boolean) => void>();

function setPending(next: PendingNav | null): void {
  const was = pending !== null;
  pending = next;
  if (pendingPoll !== null) {
    window.clearInterval(pendingPoll);
    pendingPoll = null;
  }
  if (next) {
    // The router changes the URL with history.pushState, which fires no event,
    // so watch the address while (and only while) a tap is in flight.
    pendingPoll = window.setInterval(() => {
      if (!pending) return;
      const landed = didNavigate(pending.before, window.location.href);
      const expired = Date.now() - pending.at > NAV_RECOVER_MS + 5000;
      if (landed || expired) setPending(null);
    }, 100);
  }
  if (was !== (next !== null)) {
    for (const fn of pendingListeners) {
      try {
        fn(next !== null);
      } catch {
        // a listener must never break navigation
      }
    }
  }
}

/** Is an in-app navigation from a tap still loading? Drives the top bar. */
export function subscribeNavPending(fn: (isPending: boolean) => void): () => void {
  pendingListeners.add(fn);
  return () => {
    pendingListeners.delete(fn);
  };
}

export function isNavPending(): boolean {
  return pending !== null;
}

/**
 * After a recovery has started a hard load, the router may still land the same
 * page on its own a moment later. That used to show as the page arriving and
 * then loading again. If the address changes before the hard load replaces the
 * document, the soft navigation won: stop the hard one.
 */
function cancelHardLoadIfRouterLands(before: string): void {
  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    if (didNavigate(before, window.location.href)) {
      window.clearInterval(timer);
      try {
        window.stop();
      } catch {
        // nothing to stop
      }
      return;
    }
    if (Date.now() - startedAt > 10_000) window.clearInterval(timer);
  }, 50);
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
}

/**
 * Call from a click handler whose job is to change the address.
 *
 * Two jobs, both after the tap and neither touching it:
 *
 *  1. After `NAV_STALL_MS`, if the address has not changed, report
 *     `nav_stalled`, so we can see how often a tap does nothing and what the
 *     network and login looked like.
 *  2. After `NAV_RECOVER_MS`, if the address STILL has not changed and the caller
 *     said where the tap was going (`recoverTo`), load that page the ordinary
 *     way. This is the same thing a person does when the page stops answering:
 *     reload. The back arrow and the menu rows were seen dead for good on
 *     several devices until a reload fixed them, so the app now does the reload
 *     itself rather than leaving someone to discover it.
 *
 * It reads `location.href` at the moment of the tap and again at each check,
 * never a render-time copy: the URL changes through the router and nothing
 * re-renders the caller. It never throws.
 */
export function watchNavigationStall(label: NavStallLabel, recoverTo?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const before = window.location.href;
    const target = recoverTo ? resolveRecoverTarget(recoverTo, before) : null;
    const myGeneration = ++generation;
    if (target && didNavigate(before, target)) {
      setPending({ target, before, at: Date.now() });
    }

    window.setTimeout(() => {
      try {
        const after = window.location.href;
        const visible = document.visibilityState === 'visible';
        if (!shouldReportStall({ before, after, visible })) return;

        const now = Date.now();
        if (!allowStallReport(recentReports, now, label)) return;
        recentReports.push({ at: now, label });
        if (recentReports.length > 20) recentReports.shift();

        const connection = (navigator as Navigator & { connection?: unknown }).connection;
        captureAnalyticsEvent({
          name: 'nav_stalled',
          properties: {
            label,
            waited_ms: NAV_STALL_MS,
            online: navigator.onLine,
            auth_loading: readAuthLoading(),
            ...describeConnection(connection as Parameters<typeof describeConnection>[0]),
          },
        });
      } catch {
        // A diagnostic must never be the thing that breaks the page.
      }
    }, NAV_STALL_MS);

    if (!target) return;
    window.setTimeout(() => {
      try {
        // A newer tap is in charge now.
        if (myGeneration !== generation) return;
        const after = window.location.href;
        const now = Date.now();
        // Slow but alive: the router already has the page's data and is
        // rendering it. Loading it again on top would be the double load.
        const entries =
          typeof performance !== 'undefined' && performance.getEntriesByType
            ? (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
            : [];
        if (routerJustReceived(entries, target, performance.now())) return;
        if (
          !shouldRecover({
            before,
            after,
            target,
            visible: document.visibilityState === 'visible',
            online: navigator.onLine,
          }) ||
          !allowRecovery(lastRecoveryAt, now)
        ) {
          return;
        }
        lastRecoveryAt = now;
        captureAnalyticsEvent({
          name: 'nav_recovered',
          properties: { label, waited_ms: NAV_RECOVER_MS, online: navigator.onLine },
        });
        cancelHardLoadIfRouterLands(before);
        window.location.assign(target);
      } catch {
        // Same: never the thing that breaks the page.
      }
    }, NAV_RECOVER_MS);
  } catch {
    // Same.
  }
}

/**
 * The same watch, for every ordinary link in the app. Most of the dead taps on
 * record were links (the bottom bar, the side menu), not buttons, so covering
 * only the handlers we wrote would miss them. One capture-phase listener on the
 * document: it runs before Next's own link handling and only LOOKS at the click,
 * so it cannot change what the link does. Returns a function that removes it.
 */
export function installLinkStallWatchdog(): () => void {
  if (typeof document === 'undefined') return () => {};

  const onClick = (event: MouseEvent) => {
    try {
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const target = linkClickTarget({
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        href: anchor.getAttribute('href'),
        target: anchor.getAttribute('target'),
        hasDownload: anchor.hasAttribute('download'),
        currentHref: window.location.href,
      });
      if (!target) return;
      // The same link tapped again while its first tap is still loading: let
      // the first one finish instead of starting a second load. Capture phase
      // on document runs before React's root listener, so stopping here keeps
      // Next's Link from starting another navigation, and preventDefault keeps
      // the browser from doing a full load of its own.
      if (isDuplicateNavClick(pending, target, window.location.href, Date.now())) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const path = target.split(/[?#]/)[0] || '/';
      watchNavigationStall(`link:${path}`, target);
    } catch {
      // A watchdog must never break a link.
    }
  };

  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}

function readAuthLoading(): boolean | null {
  try {
    const value = useAuthStore.getState().isLoading;
    return typeof value === 'boolean' ? value : null;
  } catch {
    return null;
  }
}
