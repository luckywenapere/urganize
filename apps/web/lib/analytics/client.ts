import posthog from 'posthog-js';
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

let hasInitializedBrowserPostHog = false;
let hasWarnedMissingBrowserConfig = false;

const featureRouteMatchers: Array<{ pattern: RegExp; feature: string }> = [
  { pattern: /^\/dashboard\/releases\/new$/, feature: 'release_creation' },
  { pattern: /^\/dashboard\/releases\/[^/]+\/playbook$/, feature: 'playbook' },
  { pattern: /^\/dashboard\/releases\/[^/]+\/metadata$/, feature: 'release_metadata' },
  { pattern: /^\/dashboard\/releases\/[^/]+$/, feature: 'release_workspace' },
  { pattern: /^\/dashboard\/pre-save/, feature: 'pre_save' },
  { pattern: /^\/dashboard\/folders\/[^/]+$/, feature: 'folder_detail' },
  { pattern: /^\/dashboard\/folders$/, feature: 'folders' },
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

export function initializeBrowserPostHog(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (hasInitializedBrowserPostHog) {
    return true;
  }

  const key = getPostHogProjectKey();
  if (!key) {
    warnMissingBrowserConfig();
    return false;
  }

  posthog.init(
    key,
    {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
      defaults: '2026-01-30',
      capture_pageviews: false,
      capture_pageleave: true,
      session_recording: {
        maskAllInputs: false,
        maskInputAttributes: ['password', 'card', 'cvv', 'ssn'],
      },
      autocapture: true,
      persistence: 'localStorage+cookie',
    } as Parameters<typeof posthog.init>[1]
  );

  hasInitializedBrowserPostHog = true;
  return true;
}

export function captureAnalyticsEvent(
  event: AnalyticsEvent,
  options?: { userId?: string | null }
) {
  const payload = event.properties as Record<string, unknown>;
  persistAnalyticsEvent(event.name, payload, options?.userId || null);

  if (!initializeBrowserPostHog()) {
    return;
  }

  posthog.capture(event.name, payload);
}

export function captureAnalyticsPageView(input: {
  pathname: string;
  search: string;
  url: string;
}) {
  if (!initializeBrowserPostHog()) {
    return;
  }

  posthog.capture('$pageview', {
    pathname: input.pathname,
    search: input.search,
    url: input.url,
  });
}

export function captureFeatureDiscovery(pathname: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const feature = resolveFeatureFromPath(pathname);
  if (!feature) {
    return;
  }

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

export function identifyAnalyticsUser(user: AnalyticsIdentity | null | undefined) {
  if (!user?.id) {
    return;
  }

  if (!initializeBrowserPostHog()) {
    return;
  }

  posthog.identify(user.id, {
    email: user.email,
    name: user.name,
    role: user.onboarding_role || user.role,
    created_at: user.created_at,
  });
}

export function resetAnalyticsUser() {
  if (typeof window === 'undefined') {
    return;
  }

  if (!initializeBrowserPostHog()) {
    return;
  }

  posthog.reset();
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

  if (!initializeBrowserPostHog()) {
    return;
  }

  posthog.capture(name, payload);
}
