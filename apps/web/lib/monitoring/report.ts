/**
 * Browser error reporting to Sentry (URG-372), without Sentry on the shared
 * first-load bundle.
 *
 * This file is on the shared chain (instrumentation-client.ts, app/error.tsx,
 * the component boundaries), so it imports NOTHING at runtime. The SDK lives in
 * ./client-init.ts and is fetched with a dynamic import once the page has
 * loaded and the main thread is idle, the same moment PostHog starts.
 *
 * Until then, uncaught errors, unhandled rejections and boundary reports are
 * held in a small queue and sent the moment the SDK is up, so a crash during
 * hydration is not lost. After init, Sentry's own global handlers take over
 * and the listeners here are removed, so nothing is sent twice.
 *
 * Every function here swallows its own failures: a reporter that throws inside
 * an error boundary unmounts the thing the boundary was protecting.
 */

type QueuedError = { error: unknown; context?: Record<string, string> };

/** A breadcrumb: a short, content-free note of what the app did just before an
 *  error ("urgans request sent"). Never put message text, names, emails or
 *  tokens in one: it is sent with any error that follows. */
export type MonitoringBreadcrumb = {
  category: string;
  message: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, string | number | boolean | null>;
};

type ClientModule = typeof import('./client-init');

const MAX_QUEUED = 20;
const MAX_QUEUED_CRUMBS = 30;

let queue: QueuedError[] = [];
let crumbs: MonitoringBreadcrumb[] = [];
let client: ClientModule | null = null;
let starting = false;
let disabled = false;

function isLocal(): boolean {
  const host = window.location?.hostname || '';
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$|\.local$/i.test(host);
}

function enqueue(item: QueuedError) {
  if (disabled) return;
  if (queue.length < MAX_QUEUED) queue.push(item);
}

function onWindowError(event: ErrorEvent) {
  enqueue({ error: event.error ?? event.message, context: { mechanism: 'onerror' } });
}

function onUnhandledRejection(event: PromiseRejectionEvent) {
  enqueue({ error: event.reason, context: { mechanism: 'onunhandledrejection' } });
}

function afterPageLoad(task: () => void) {
  const idle = () => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(task, { timeout: 4_000 });
    else window.setTimeout(task, 800);
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

function stopListening() {
  window.removeEventListener('error', onWindowError);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
}

/** Called once from instrumentation-client.ts. */
export function startErrorMonitoring() {
  try {
    if (typeof window === 'undefined' || starting) return;
    starting = true;
    if (isLocal()) {
      disabled = true;
      return;
    }

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    afterPageLoad(() => {
      import('./client-init')
        .then((mod) => {
          stopListening();
          if (!mod.initBrowserSentry()) {
            disabled = true;
            queue = [];
            crumbs = [];
            return;
          }
          client = mod;
          const pendingCrumbs = crumbs;
          crumbs = [];
          for (const crumb of pendingCrumbs) mod.addBrowserBreadcrumb(crumb);
          const pending = queue;
          queue = [];
          for (const item of pending) mod.captureBrowserError(item.error, item.context);
        })
        .catch(() => {
          // The chunk did not download (offline, blocked). Nothing to report
          // with, so stop collecting rather than grow the queue forever.
          stopListening();
          disabled = true;
          queue = [];
          crumbs = [];
        });
    });
  } catch {
    // Monitoring must never break the app.
  }
}

/** Report an error a React boundary caught (those never reach window.onerror).
 *  Safe to call before the SDK has loaded: it queues. */
export function reportErrorToMonitoring(error: unknown, context?: Record<string, string>) {
  try {
    if (typeof window === 'undefined' || disabled) return;
    if (client) client.captureBrowserError(error, context);
    else enqueue({ error, context });
  } catch {
    // Ignore.
  }
}

/** Leave a breadcrumb for the next error report. Safe before the SDK has
 *  loaded (the newest few are held), and a no-op on a local dev server. */
export function addMonitoringBreadcrumb(crumb: MonitoringBreadcrumb) {
  try {
    if (typeof window === 'undefined' || disabled) return;
    if (client) {
      client.addBrowserBreadcrumb(crumb);
      return;
    }
    crumbs.push(crumb);
    if (crumbs.length > MAX_QUEUED_CRUMBS) crumbs.shift();
  } catch {
    // Ignore.
  }
}
