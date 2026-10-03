import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { useAuthStore } from '@/lib/auth-store';
import {
  NAV_STALL_MS,
  allowStallReport,
  describeConnection,
  shouldReportStall,
  type NavStallLabel,
} from '@/lib/nav-stall';

// Module state is per page load, which is the right lifetime for a rate limit:
// a reload is a fresh start.
const recentReports: Array<{ at: number; label: string }> = [];

/**
 * Call from a click handler whose job is to change the address. If the address
 * is still the same `NAV_STALL_MS` later, report `nav_stalled` once. It reads
 * `location.href` at the moment of the tap and again at the check, never a
 * render-time copy, for the reason MobileNavBar's click handlers give: the URL
 * changes through `router.replace` and nothing re-renders the caller.
 *
 * It never throws and never touches the click itself, so adding it to a handler
 * cannot make that handler worse.
 */
export function watchNavigationStall(label: NavStallLabel): void {
  if (typeof window === 'undefined') return;
  try {
    const before = window.location.href;
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
  } catch {
    // Same.
  }
}

function readAuthLoading(): boolean | null {
  try {
    const value = useAuthStore.getState().isLoading;
    return typeof value === 'boolean' ? value : null;
  } catch {
    return null;
  }
}
