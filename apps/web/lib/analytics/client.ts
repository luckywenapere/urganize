import type { PostHog } from 'posthog-js';
import { installBundledExtensionGuard } from './posthog-extensions';
import { POSTHOG_PROXY_PATH, resolvePostHogUiHost } from './posthog-proxy';
import {
  type AnalyticsEvent,
  type AnalyticsIdentity,
  type StoredAnalyticsEvent,
  getPostHogProjectKey,
} from './shared';

const ANALYTICS_STORAGE_KEY = 'urganize.analytics.events';
const ANALYTICS_FEATURES_STORAGE_KEY = 'urganize.analytics.discovered-features';
const ONBOARDING_STARTED_AT_STORAGE_KEY = 'urganize.analytics.onboarding.started-at';
const MAX_STORED_EVENTS = 400;

// posthog-js is one of the largest client dependencies. It used to be a
// static import here, which put it in the render-blocking first-load bundle
// of every route. It now loads as a deferred async chunk: init still happens
// on page load (instrumentation-client.ts) so autocapture and session
// recording behave exactly as before — the library just no longer blocks
// download/parse/hydration. The memoized promise doubles as the "already
// initialized" flag, and chaining every capture through it preserves call
// order (identify-before-capture, etc.).
let posthogClientPromise: Promise<PostHog | null> | null = null;

let hasWarnedMissingBrowserConfig = false;

const featureRouteMatchers: Array<{ pattern: RegExp; feature: string }> = [
  { pattern: /^\/dashboard\/releases\/new$/, feature: 'release_creation' },
  { pattern: /^\/dashboard\/releases\/[^/]+\/playbook$/, feature: 'playbook' },
  // The /metadata entry was removed 2026-08-04: that route is now a redirect
  // stub (the metadata hub opens as an overlay window on /dashboard), so the
  // browser's pathname can never equal it again. Discovery for that feature is
  // reported explicitly via captureFeatureDiscoveryByName from
  // ReleaseSceneOverlay instead.
  { pattern: /^\/dashboard\/releases\/[^/]+$/, feature: 'release_workspace' },
  { pattern: /^\/dashboard$/, feature: 'dashboard' },
  { pattern: /^\/settings$/, feature: 'settings' },
];

function warnMissingBrowserConfig() {
  if (hasWarnedMissingBrowserConfig || process.env.NODE_ENV !== 'production') {
    return;
  }

  hasWarnedMissingBrowserConfig = true;
  console.warn(
    'PostHog is not configured. Set NEXT_PUBLIC_POSTHOG_KEY or NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN to enable analytics.'
  );
}

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function persistAnalyticsEvent(
  name: string,
  payload: Record<string, unknown>,
  userId: string | null = null
) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextEvent: StoredAnalyticsEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    userId,
    timestamp: new Date().toISOString(),
    payload,
  };

  try {
    const currentEvents = safeParseJson<StoredAnalyticsEvent[]>(
      window.localStorage.getItem(ANALYTICS_STORAGE_KEY),
      []
    );
    const nextEvents = [...currentEvents, nextEvent].slice(-MAX_STORED_EVENTS);
    window.localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(nextEvents));
  } catch {
    // Analytics must never break the app.
  }
}

function resolveFeatureFromPath(pathname: string): string | null {
  for (const entry of featureRouteMatchers) {
    if (entry.pattern.test(pathname)) {
      return entry.feature;
    }
  }

  return null;
}

/**
 * Resolves once the page has finished loading and the main thread is idle
 * (2026-10-15, perf pass URG-314). PostHog used to start downloading and
 * initialising (session replay, autocapture) during hydration, competing with
 * the app's own JavaScript for the network and main thread on slow phones.
 * Events captured before then are not lost: every capture chains on the same
 * promise, so they flush in order once the client is up.
 */
function afterPageLoad(): Promise<void> {
  return new Promise((resolve) => {
    const idle = () => {
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (typeof w.requestIdleCallback === 'function') {
        w.requestIdleCallback(() => resolve(), { timeout: 3_000 });
      } else {
        window.setTimeout(resolve, 500);
      }
    };
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
  });
}

function loadBrowserPostHog(): Promise<PostHog | null> {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  const key = getPostHogProjectKey();
  if (!key) {
    warnMissingBrowserConfig();
    return Promise.resolve(null);
  }

  if (!posthogClientPromise) {
    posthogClientPromise = afterPageLoad()
      .then(() => import('posthog-js'))
      .then((mod) => {
        const client = mod.default;
        // After the import, before init. Exception capture, session replay and
        // dead-click autocapture are all fetched by the SDK from
        // /static/<name>.js, and content blockers refuse those filenames even
        // through our own proxy — so this swaps the fetch for an import of our
        // own chunk, at the same moment and with the same laziness. See
        // ./posthog-extensions.ts.
        installBundledExtensionGuard(window);
        client.init(
          key,
          {
            // First-party path, rewritten to PostHog by next.config.js. NOT the
            // real host: tracking protection blocks us-assets.i.posthog.com
            // before the request leaves the browser, which is how this app ran
            // with analytics silently dead. See lib/analytics/posthog-proxy.ts.
            api_host: POSTHOG_PROXY_PATH,
            // Where in-app links should point, since api_host no longer names
            // PostHog. Without this the toolbar and its links resolve against
            // our own domain.
            ui_host: resolvePostHogUiHost(process.env.NEXT_PUBLIC_POSTHOG_HOST),
            defaults: '2026-01-30',
            capture_pageviews: false,
            capture_pageleave: true,
            session_recording: {
              maskAllInputs: false,
              maskInputAttributes: ['password', 'card', 'cvv', 'ssn'],
            },
            autocapture: true,
            // Error Tracking (2026-09-03). Unhandled exceptions and promise
            // rejections are captured as $exception events and grouped into
            // issues in PostHog, which is where a Linear ticket is raised from.
            //
            // Set EXPLICITLY rather than left to `defaults`: it is the one
            // capture behaviour here whose absence is invisible — nothing in
            // the app looks different, the crashes just go unrecorded — so it
            // should not depend on what a dated defaults bundle happens to
            // include. Typed through the cast below; `capture_exceptions` is
            // honoured at runtime (see posthog-js's startExceptionAutocapture).
            //
            // This is the half the app cannot do for itself: the report dialog
            // catches bugs a user notices AND bothers to report, this catches
            // the ones nobody mentions.
            capture_exceptions: true,
            // Surveys are unused (2026-10-15, perf pass URG-314). Left on,
            // the SDK fetched a ~33 KB surveys script on every page view.
            disable_surveys: true,
            persistence: 'localStorage+cookie',
          } as Parameters<PostHog['init']>[1]
        );
        return client;
      })
      .catch(() => {
        // Analytics must never break the app — a failed chunk load (offline,
        // ad blocker) just disables PostHog for this session.
        return null;
      });
  }

  return posthogClientPromise;
}

export async function initializeBrowserPostHog(): Promise<boolean> {
  return (await loadBrowserPostHog()) !== null;
}

export function captureAnalyticsEvent(
  event: AnalyticsEvent,
  options?: { userId?: string | null }
) {
  const payload = event.properties as Record<string, unknown>;
  persistAnalyticsEvent(event.name, payload, options?.userId || null);

  void loadBrowserPostHog().then((client) => client?.capture(event.name, payload));
}

export function captureAnalyticsPageView(input: {
  pathname: string;
  search: string;
  url: string;
}) {
  void loadBrowserPostHog().then((client) =>
    client?.capture('$pageview', {
      pathname: input.pathname,
      search: input.search,
      url: input.url,
    })
  );
}

/** Fire `feature_discovered` at most once per browser for a given feature.
 * Extracted from captureFeatureDiscovery (2026-08-04) so features that are no
 * longer reachable by a route change can report discovery explicitly — see
 * captureFeatureDiscoveryByName below. */
function fireFeatureDiscoveryOnce(feature: string) {
  try {
    const discoveredFeatures = safeParseJson<string[]>(
      window.localStorage.getItem(ANALYTICS_FEATURES_STORAGE_KEY),
      []
    );

    if (discoveredFeatures.includes(feature)) {
      return;
    }

    captureAnalyticsEvent({
      name: 'feature_discovered',
      properties: { feature },
    });

    window.localStorage.setItem(
      ANALYTICS_FEATURES_STORAGE_KEY,
      JSON.stringify([...discoveredFeatures, feature])
    );
  } catch {
    // Analytics must never break the app.
  }
}

export function captureFeatureDiscovery(pathname: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const feature = resolveFeatureFromPath(pathname);
  if (!feature) {
    return;
  }

  fireFeatureDiscoveryOnce(feature);
}

/**
 * Report feature discovery by name rather than by route. Needed since
 * 2026-08-04, when the release scenes (Metadata / Calendar / Files / Press kit)
 * stopped being routes and became overlay windows on /dashboard — the
 * route-matcher path below can never fire for them again, because there is no
 * longer a navigation to match.
 */
export function captureFeatureDiscoveryByName(feature: string) {
  if (typeof window === 'undefined') {
    return;
  }

  fireFeatureDiscoveryOnce(feature);
}

export function identifyAnalyticsUser(user: AnalyticsIdentity | null | undefined) {
  if (!user?.id) {
    return;
  }

  void loadBrowserPostHog().then((client) =>
    client?.identify(user.id, {
      email: user.email,
      name: user.name,
      role: user.onboarding_role || user.role,
      created_at: user.created_at,
    })
  );
}

export function resetAnalyticsUser() {
  if (typeof window === 'undefined') {
    return;
  }

  // If the library never loaded this session there is no identity to reset —
  // don't force the chunk to download just to clear it.
  if (!posthogClientPromise) {
    return;
  }

  void posthogClientPromise.then((client) => client?.reset());
}

export function markOnboardingStarted() {
  if (typeof window === 'undefined') {
    return;
  }

  const existingValue = window.localStorage.getItem(ONBOARDING_STARTED_AT_STORAGE_KEY);
  if (existingValue) {
    return;
  }

  window.localStorage.setItem(ONBOARDING_STARTED_AT_STORAGE_KEY, String(Date.now()));
  captureAnalyticsEvent({
    name: 'onboarding_started',
    properties: {},
  });
}

export function getOnboardingElapsedSeconds(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(ONBOARDING_STARTED_AT_STORAGE_KEY);
  const startedAt = Number(rawValue);
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
}

export function clearOnboardingTrackingState() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(ONBOARDING_STARTED_AT_STORAGE_KEY);
}

export function readTrackedEvents(): StoredAnalyticsEvent[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    return safeParseJson<StoredAnalyticsEvent[]>(
      window.localStorage.getItem(ANALYTICS_STORAGE_KEY),
      []
    );
  } catch {
    return [];
  }
}

export function clearTrackedEvents() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(ANALYTICS_STORAGE_KEY);
}

export function trackEvent(
  name: string,
  options?: {
    userId?: string | null;
    payload?: Record<string, unknown>;
  }
) {
  const payload = options?.payload || {};
  persistAnalyticsEvent(name, payload, options?.userId || null);

  void loadBrowserPostHog().then((client) => client?.capture(name, payload));
}
