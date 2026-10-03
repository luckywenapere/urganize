import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { useAuthStore } from '@/lib/auth-store';
import {
  NAV_RECOVER_MS,
  NAV_STALL_MS,
  allowRecovery,
  allowStallReport,
  describeConnection,
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
        const after = window.location.href;
        const now = Date.now();
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
