import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerPostHogClient, shutdownServerAnalytics } from './analytics/server';
import type { AnalyticsEvent } from './analytics/shared';
import { afterResponse } from './after-response';
import type { ProfileGrowthEventKind, ProfileCtaKind, SignupSource } from './profile-growth';

// Server half of the profile growth loop (2026-10-11). Two things, both
// reporting only:
//
//  1. PostHog events, built by lib/profile-growth.ts from allowlists. A
//     visitor with no account is sent as an anonymous event with no person
//     profile ($process_person_profile: false) and a fresh random id, so a
//     stranger reading a page never becomes a "person" in PostHog.
//  2. One row in public.profile_growth_events for the three steps the admin
//     funnel cannot read from any other table: a page read, a CTA tap and a
//     sign-up that came from the loop. Counts only: a kind, the profile, the
//     CTA and, for a sign-up, the new account. No IP, no user agent, no slug.
//
// NEVER THROWS and never delays the reply (afterResponse). Before the
// migration is applied the insert fails and is logged once per call; the page
// and the redirect are untouched. Missing a data point costs a number;
// failing a page because of it would cost a visitor.

export const PROFILE_GROWTH_EVENTS_TABLE = 'profile_growth_events';

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sendEvent(distinctId: string | null, event: AnalyticsEvent): Promise<void> {
  const posthog = createServerPostHogClient();
  if (!posthog) return;
  try {
    posthog.capture({
      distinctId: distinctId || `anon-${randomUUID()}`,
      event: event.name,
      properties: {
        ...(event.properties as Record<string, unknown>),
        ...(distinctId ? {} : { $process_person_profile: false }),
      },
    });
  } finally {
    await shutdownServerAnalytics(posthog);
  }
}

/** A PostHog event from the loop, after the reply. `distinctId` null = anonymous. */
export function captureProfileGrowthEvent(label: string, distinctId: string | null, event: AnalyticsEvent): void {
  afterResponse(label, () => sendEvent(distinctId, event));
}

type GrowthRow = {
  kind: ProfileGrowthEventKind;
  person_id: string | null;
  cta: ProfileCtaKind | null;
  source: SignupSource | null;
  user_id: string | null;
};

async function personIdForSlug(admin: SupabaseClient, slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const { data } = await admin.from('person_profiles').select('id').eq('slug', slug).maybeSingle();
  const id = (data as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : null;
}

async function insertRow(row: Omit<GrowthRow, 'person_id'> & { slug: string | null; personId?: string | null }): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  const personId = row.personId ?? (await personIdForSlug(admin, row.slug));
  const { error } = await admin.from(PROFILE_GROWTH_EVENTS_TABLE).insert({
    kind: row.kind,
    person_id: personId,
    cta: row.cta,
    source: row.source,
    user_id: row.user_id,
  });
  // 23505: the one-sign-up-per-account index. Already counted, which is fine.
  if (error && error.code !== '23505') {
    console.warn(`[profile-growth] could not record ${row.kind}:`, error.message);
  }
}

/** One row for the admin funnel, after the reply. */
export function recordProfileGrowthRow(
  label: string,
  row: {
    kind: ProfileGrowthEventKind;
    slug: string | null;
    personId?: string | null;
    cta?: ProfileCtaKind | null;
    source?: SignupSource | null;
    userId?: string | null;
  }
): void {
  afterResponse(label, () =>
    insertRow({
      kind: row.kind,
      slug: row.slug,
      personId: row.personId ?? null,
      cta: row.cta ?? null,
      source: row.source ?? null,
      user_id: row.userId ?? null,
    })
  );
}

/**
 * The CTA tap, after the redirect has gone. Looks the page up once to know
 * whether it is a claimed, published page (the only kind whose slug is sent)
 * and which profile row to count it against. A slug nobody has is still a tap
 * and is counted with no profile.
 */
export function recordProfileCtaTap(input: {
  slug: string;
  cta: ProfileCtaKind;
  buildEvent: (page: { claimed: boolean }) => AnalyticsEvent;
}): void {
  afterResponse('profile-growth cta', async () => {
    const admin = adminClient();
    let personId: string | null = null;
    let claimed = false;
    if (admin) {
      const { data } = await admin
        .from('person_profiles')
        .select('id, status, visibility')
        .eq('slug', input.slug)
        .maybeSingle();
      const row = (data ?? null) as { id?: unknown; status?: unknown; visibility?: unknown } | null;
      if (row && typeof row.id === 'string') {
        personId = row.id;
        claimed = row.status === 'claimed' && row.visibility === 'public';
      }
    }
    await Promise.all([
      sendEvent(null, input.buildEvent({ claimed })),
      insertRow({ kind: 'cta_click', slug: null, personId, cta: input.cta, source: null, user_id: null }),
    ]);
  });
}

/**
 * A read of /p/{slug}, recorded from the server render (the brief asked for it
 * server-side, so an ad blocker cannot hide it). Link previews and prefetches
 * are the server-side cost of that choice, so the caller passes the request's
 * user agent and headers and they are not counted. The browser beacon
 * `profile_viewed` (the directory funnel) still fires beside it; the two are
 * separate events and should not be added together.
 */
export function recordPublicProfileView(input: {
  slug: string;
  claimed: boolean;
  personId: string | null;
  isBotOrPrefetch: boolean;
  event: AnalyticsEvent;
}): void {
  if (input.isBotOrPrefetch) return;
  captureProfileGrowthEvent('profile-growth view', null, input.event);
  recordProfileGrowthRow('profile-growth view row', {
    kind: 'profile_view',
    slug: input.personId ? null : input.slug,
    personId: input.personId,
  });
}
