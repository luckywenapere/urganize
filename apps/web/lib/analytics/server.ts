import { PostHog } from 'posthog-node';
import { getPostHogProjectKey, type AnalyticsEvent } from './shared';

let hasWarnedMissingServerConfig = false;

function warnMissingServerConfig() {
  if (hasWarnedMissingServerConfig || process.env.NODE_ENV !== 'production') {
    return;
  }

  hasWarnedMissingServerConfig = true;
  console.warn(
    'PostHog server capture is disabled because NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN are missing.'
  );
}

export function createServerPostHogClient(): PostHog | null {
  const apiKey = getPostHogProjectKey();
  if (!apiKey) {
    warnMissingServerConfig();
    return null;
  }

  return new PostHog(apiKey, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
  });
}

export function captureServerAnalyticsEvent(
  client: PostHog | null,
  distinctId: string | null | undefined,
  event: AnalyticsEvent
) {
  if (!client || !distinctId) {
    return;
  }

  client.capture({
    distinctId,
    event: event.name,
    properties: event.properties as Record<string, unknown>,
  });
}

export async function shutdownServerAnalytics(client: PostHog | null) {
  if (!client) {
    return;
  }

  try {
    await client.shutdown();
  } catch {
    // Analytics must never break the request lifecycle.
  }
}
