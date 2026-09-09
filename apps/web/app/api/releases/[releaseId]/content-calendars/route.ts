import { NextRequest, NextResponse } from 'next/server';
import {
  CONTENT_CALENDARS_TABLE,
  CONTENT_POSTS_TABLE,
  createAdminClient,
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  isContentCalendarFeatureEnabled,
  isValidPlatform,
  requireActiveAuthenticatedUser,
  toContentCalendar,
  validateCalendarName,
} from './_shared';

const CALENDAR_COLUMNS = 'id,release_id,platform,name,created_at,updated_at';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isContentCalendarFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const { data: calendarRows, error: calendarsError } = await adminClient
    .from(CONTENT_CALENDARS_TABLE)
    .select(CALENDAR_COLUMNS)
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true });

  if (calendarsError) {
    return NextResponse.json(
      { error: calendarsError.message || 'Could not load calendars.' },
      { status: 500 }
    );
  }

  const rows = (calendarRows || []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return NextResponse.json({ calendars: [] });
  }

  // Post counts as ONE query for the whole release, grouped in code
  // (hardening item 6; supabase-js has no group by, so fetch the calendar_id
  // column only and reduce). Never a count query per calendar.
  const { data: postRows, error: postsError } = await adminClient
    .from(CONTENT_POSTS_TABLE)
    .select('calendar_id')
    .eq('release_id', releaseId);

  if (postsError) {
    return NextResponse.json(
      { error: postsError.message || 'Could not load post counts.' },
      { status: 500 }
    );
  }

  const postCounts = new Map<string, number>();
  for (const row of (postRows || []) as Array<{ calendar_id: string | null }>) {
    if (!row.calendar_id) continue;
    postCounts.set(row.calendar_id, (postCounts.get(row.calendar_id) || 0) + 1);
  }

  const calendars = rows.map((row) =>
    toContentCalendar(row, postCounts.get(String(row.id || '')) || 0)
  );

  return NextResponse.json({ calendars });
}

type CalendarCreateBody = {
  platform?: unknown;
  name?: unknown;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isContentCalendarFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  const body = (await request.json().catch(() => null)) as CalendarCreateBody | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  if (!isValidPlatform(body.platform)) {
    return NextResponse.json(
      { error: 'Pick a platform from the list.' },
      { status: 400 }
    );
  }

  const name = validateCalendarName(body.name);
  if (name.error) {
    return NextResponse.json({ error: name.error }, { status: 400 });
  }

  const insertResult = await adminClient
    .from(CONTENT_CALENDARS_TABLE)
    .insert({
      // The RELEASE owner, not the acting teammate: the row must survive the
      // teammate's account (auth.users delete-cascade) and stay visible to
      // the owner's RLS/export, which key on this column.
      owner_user_id: ownership.release.ownerUserId,
      release_id: releaseId,
      platform: body.platform,
      name: name.value,
    })
    .select(CALENDAR_COLUMNS)
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    return NextResponse.json(
      { error: insertResult.error?.message || 'Could not create calendar.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { calendar: toContentCalendar(insertResult.data as Record<string, unknown>) },
    { status: 201 }
  );
}
