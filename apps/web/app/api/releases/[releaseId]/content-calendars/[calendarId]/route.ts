import { NextRequest, NextResponse } from 'next/server';
import {
  CONTENT_CALENDARS_TABLE,
  createAdminClient,
  ensureCalendarInRelease,
  ensureReleaseTeamWriteAccess,
  isContentCalendarFeatureEnabled,
  requireActiveAuthenticatedUser,
  toContentCalendar,
  validateCalendarName,
} from '../_shared';

const CALENDAR_COLUMNS = 'id,release_id,platform,name,created_at,updated_at';

type RouteContext = { params: Promise<{ releaseId: string; calendarId: string }> };

type CalendarPatchBody = {
  name?: unknown;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isContentCalendarFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, calendarId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }
  if (!calendarId) {
    return NextResponse.json({ error: 'Calendar id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  // Tenancy boundary (hardening item 1): the calendar must belong to the
  // URL's release before any mutation touches it.
  const calendarCheck = await ensureCalendarInRelease(adminClient, calendarId, releaseId);
  if ('error' in calendarCheck) return calendarCheck.error;

  const body = (await request.json().catch(() => null)) as CalendarPatchBody | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  // Rename only. Require the key so an empty PATCH cannot silently blank the
  // name; sending null or '' clears it deliberately.
  if (body.name === undefined) {
    return NextResponse.json({ error: 'name is required.' }, { status: 400 });
  }

  const name = validateCalendarName(body.name);
  if (name.error) {
    return NextResponse.json({ error: name.error }, { status: 400 });
  }

  const updateResult = await adminClient
    .from(CONTENT_CALENDARS_TABLE)
    .update({ name: name.value })
    .eq('id', calendarId)
    .eq('release_id', releaseId)
    .select(CALENDAR_COLUMNS)
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    return NextResponse.json(
      { error: updateResult.error?.message || 'Could not rename calendar.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    calendar: toContentCalendar(updateResult.data as Record<string, unknown>),
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isContentCalendarFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId, calendarId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Release id is required.' }, { status: 400 });
  }
  if (!calendarId) {
    return NextResponse.json({ error: 'Calendar id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  // The destructive variant that makes the tenancy check non-negotiable
  // (hardening item 1): never delete a calendar hanging off another release.
  const calendarCheck = await ensureCalendarInRelease(adminClient, calendarId, releaseId);
  if ('error' in calendarCheck) return calendarCheck.error;

  // Posts cascade at the database level (content_posts_calendar_release_fkey
  // ON DELETE CASCADE), so this single delete removes the whole calendar.
  const deleteResult = await adminClient
    .from(CONTENT_CALENDARS_TABLE)
    .delete()
    .eq('id', calendarId)
    .eq('release_id', releaseId);

  if (deleteResult.error) {
    return NextResponse.json(
      { error: deleteResult.error.message || 'Could not delete calendar.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
