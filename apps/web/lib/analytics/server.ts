import { PostHog } from 'posthog-node';
import { getPostHogProjectKey, type AnalyticsEvent } from './shared';
import { resolvePostHogIngestHost } from './posthog-proxy';
import { createClient } from '@supabase/supabase-js';
import { isInternalAccountEmail } from '@/lib/internal-accounts';

// Our own and test accounts stay out of PostHog on the server too (2026-10-16,
// founder). The event's distinct id is a user id, so its email is looked up
// once and remembered; the capture waits for that answer, and
// shutdownServerAnalytics waits for every pending capture before flushing.
const INTERNAL_TTL_MS = 60 * 60 * 1000;
const internalById = new Map<string, { internal: boolean; until: number }>();
const pendingCaptures = new WeakMap<PostHog, Promise<void>[]>();

async function isInternalUserId(userId: string): Promise<boolean> {
  const cached = internalById.get(userId);
  if (cached && cached.until > Date.now()) return cached.internal;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return false;
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await db.from('profiles').select('email').eq('id', userId).maybeSingle();
    const internal = isInternalAccountEmail((data as { email?: string | null } | null)?.email ?? null);
    if (internalById.size > 5_000) internalById.clear();
    internalById.set(userId, { internal, until: Date.now() + INTERNAL_TTL_MS });
    return internal;
  } catch {
    return false;
  }
}

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
    // The REAL host, deliberately not the browser's proxy path: this runs on
    // the server, where nothing blocks it, and pointing it at /urg-relay would
    // make the app call itself. Resolved through the shared helper so "the real
    // host" has one definition — and so the stale app.posthog.com default is
    // upgraded to the regional ingest host.
    host: resolvePostHogIngestHost(process.env.NEXT_PUBLIC_POSTHOG_HOST),
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

  const capture = isInternalUserId(distinctId).then((internal) => {
    if (internal) return;
    client.capture({
      distinctId,
      event: event.name,
      properties: event.properties as Record<string, unknown>,
    });
  });
  const pending = pendingCaptures.get(client) ?? [];
  pending.push(capture.catch(() => undefined));
  pendingCaptures.set(client, pending);
}

export async function shutdownServerAnalytics(client: PostHog | null) {
  if (!client) {
    return;
  }

  try {
    await Promise.all(pendingCaptures.get(client) ?? []);
    pendingCaptures.delete(client);
    await client.shutdown();
  } catch {
    // Analytics must never break the request lifecycle.
  }
}
