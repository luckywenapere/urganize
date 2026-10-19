import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createAdminClient, getAuthenticatedUser, requireAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { requireCuratorUser } from '@/app/api/curator/_shared';
import { ensureReleaseVisible } from '@/app/api/pitching/_shared';
import { isFrontDeskEnabledFor } from '@/lib/front-desk/flag';
import { loadDeskPitch, type DeskPitchRow } from '@/lib/front-desk/server';

// Gates for the UrgAns front desk routes (URG-381).
//
// THE FLAG: every route 404s unless the SIGNED-IN person is on the front desk
// list (lib/front-desk/flag.ts). 404, not 403, so the routes do not announce
// themselves to anyone else.
//
// PRIVACY: the artist gate loads ONE pitch and proves the caller can see its
// release (owner or teammate, the same rule as the pitch list), answering 404
// for a pitch that is missing or not theirs, so ids cannot be probed. The curator
// gate proves the pitch is addressed to THIS curator. No route lists anything
// across pitches for an artist.

type Fail = { error: NextResponse };
type Ok<T> = { error?: undefined } & T;
type Gate<T> = Promise<Fail | Ok<T>>;
type DeskAuth = { user: User; adminClient: SupabaseClient };

export const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

/** Any signed-in person on the flag list (the "am I in?" probe). */
export async function requireDeskPerson(request: NextRequest): Gate<DeskAuth> {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth && auth.error) return { error: auth.error };
  if (!isFrontDeskEnabledFor(auth.user.email)) return { error: notFound() };
  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }
  return { user: auth.user, adminClient };
}

/** A flagged curator, acting on their own front desk. */
export async function requireDeskCurator(request: NextRequest): Gate<DeskAuth> {
  const probe = await getAuthenticatedUser(request);
  if ('error' in probe && probe.error) return { error: probe.error };
  if (!isFrontDeskEnabledFor(probe.user.email)) return { error: notFound() };
  const auth = await requireCuratorUser(request);
  if ('error' in auth && auth.error) return { error: auth.error };
  if (!('user' in auth) || !auth.user || !auth.adminClient) return { error: notFound() };
  return { user: auth.user, adminClient: auth.adminClient };
}

/** A flagged team member asking about ONE pitch their team sent. */
export async function requireDeskArtistPitch(request: NextRequest, pitchId: string): Gate<DeskAuth & { pitch: DeskPitchRow }> {
  const probe = await getAuthenticatedUser(request);
  if ('error' in probe && probe.error) return { error: probe.error };
  if (!isFrontDeskEnabledFor(probe.user.email)) return { error: notFound() };

  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth && auth.error) return { error: auth.error };
  if (!('user' in auth) || !auth.user || !auth.adminClient) return { error: notFound() };

  let pitch: DeskPitchRow | null = null;
  try {
    pitch = await loadDeskPitch(auth.adminClient, pitchId);
  } catch {
    return { error: NextResponse.json({ error: 'Could not load the pitch.' }, { status: 500 }) };
  }
  if (!pitch || !pitch.releaseId || !pitch.curatorUserId) return { error: notFound() };

  const visible = await ensureReleaseVisible(auth.adminClient, pitch.releaseId, auth.user);
  if ('error' in visible) return { error: notFound() };

  return { user: auth.user, adminClient: auth.adminClient, pitch };
}

/** The curator's own pitch, or 404. */
export async function requireDeskCuratorPitch(request: NextRequest, pitchId: string): Gate<DeskAuth & { pitch: DeskPitchRow }> {
  const auth = await requireDeskCurator(request);
  if ('error' in auth && auth.error) return { error: auth.error };
  let pitch: DeskPitchRow | null = null;
  try {
    pitch = await loadDeskPitch(auth.adminClient, pitchId);
  } catch {
    return { error: NextResponse.json({ error: 'Could not load the pitch.' }, { status: 500 }) };
  }
  if (!pitch || pitch.curatorUserId !== auth.user.id) return { error: notFound() };
  return { user: auth.user, adminClient: auth.adminClient, pitch };
}

export async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
