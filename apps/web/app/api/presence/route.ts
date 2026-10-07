import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { PRESENCE_TABLE, parseSurface, presenceDay } from '@/lib/presence';

// The "last seen" ping (2026-10-07). The browser sends it every couple of
// minutes while a tab is visible (components/app/PresenceBeacon.tsx), and it
// upserts one row per person per Lagos day in user_presence_days. Read only by
// /admin/metrics.
//
// OPEN ROUTE, ON PURPOSE: getAuthenticatedUser and never the paywall wrapper. A
// team on the wall or in read-only mode still opens the app, and those are the
// people the retention numbers most need to see. It must also never answer 402,
// which lib/access-redirect.ts would turn into a redirect to /locked.
//
// Never fails the caller: a missing table (before the migration is applied) or
// a write error is logged and still answers 204. This is telemetry, and the
// browser ignores the answer anyway.

export const dynamic = 'force-dynamic';

let warnedMissingTable = false;

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let surfaceInput: unknown = null;
  try {
    const body = (await request.json()) as { surface?: unknown } | null;
    surfaceInput = body?.surface ?? null;
  } catch {
    // An empty or unreadable body is fine: the surface falls back.
  }

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return new NextResponse(null, { status: 204 });

  const now = new Date();
  // PostgREST's upsert merges only the columns sent, so first_seen_at keeps the
  // value it got when the day's row was first written.
  const { error } = await admin.from(PRESENCE_TABLE).upsert(
    {
      user_id: auth.user.id,
      day: presenceDay(now),
      last_seen_at: now.toISOString(),
      surface: parseSurface(surfaceInput),
    },
    { onConflict: 'user_id,day' }
  );

  if (error) {
    const missing = error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find/i.test(error.message);
    if (!missing || !warnedMissingTable) {
      console.warn('[presence] could not record a ping', { code: error.code, message: error.message });
      if (missing) warnedMissingTable = true;
    }
  }

  return new NextResponse(null, { status: 204 });
}
