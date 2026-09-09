import { NextRequest, NextResponse } from 'next/server';
import {
  CONTENT_POSTS_TABLE,
  createAdminClient,
  ensureCalendarInRelease,
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  isContentCalendarFeatureEnabled,
  isValidPostFormat,
  isValidPostPillar,
  isValidPostStatus,
  isValidScheduledDate,
  loadSharedGroupCounts,
  requireActiveAuthenticatedUser,
  toContentPost,
  validatePostCaption,
  validatePostTitle,
} from '../content-calendars/_shared';
import { getClientTodayIso, resolveMonth } from '@/lib/content-calendar';

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

  const calendarId = request.nextUrl.searchParams.get('calendarId');
  if (!calendarId) {
    return NextResponse.json({ error: 'calendarId query parameter is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const ownership = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in ownership) return ownership.error;

  // Tenancy boundary (hardening item 1): the calendar must belong to the
  // URL's release; the admin client bypasses RLS so this check is the guard.
  const calendarCheck = await ensureCalendarInRelease(adminClient, calendarId, releaseId);
  if ('error' in calendarCheck) return calendarCheck.error;

  // Always month-windowed server-side (hardening item 7): a valid ?month=
  // wins, else the release month, else the current month. Payloads stay
  // bounded by construction even when the client sends no param.
  const month = resolveMonth(
    request.nextUrl.searchParams.get('month'),
    ownership.release.releaseDate,
    getClientTodayIso()
  );

  const [yearValue, monthValue] = month.split('-').map(Number);
  const lastDayOfMonth = new Date(yearValue, monthValue, 0).getDate();
  const windowStart = `${month}-01`;
  const windowEnd = `${month}-${String(lastDayOfMonth).padStart(2, '0')}`;

  const { data, error } = await adminClient
    .from(CONTENT_POSTS_TABLE)
    .select('*')
    .eq('calendar_id', calendarId)
    .eq('release_id', releaseId)
    .gte('scheduled_date', windowStart)
    .lte('scheduled_date', windowEnd)
    .order('scheduled_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not load posts.' }, { status: 500 });
  }

  const rows = (data || []) as Record<string, unknown>[];

  // Sibling counts for the "On N calendars" stamp (hardening item 14). Phase
  // A: every shared_group_id is null, so this resolves without a query.
  const sharedCounts = await loadSharedGroupCounts(
    adminClient,
    rows.map((row) => (row.shared_group_id ? String(row.shared_group_id) : null))
  );
  if ('error' in sharedCounts) return sharedCounts.error;

  const posts = rows.map((row) =>
    toContentPost(
      row,
      row.shared_group_id ? sharedCounts.counts.get(String(row.shared_group_id)) || 1 : 1
    )
  );

  return NextResponse.json({ posts, month });
}

type PostCreateBody = {
  additionalCalendarIds?: unknown;
  calendarId?: unknown;
  scheduledDate?: unknown;
  title?: unknown;
  caption?: unknown;
  format?: unknown;
  status?: unknown;
  pillar?: unknown;
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

  const body = (await request.json().catch(() => null)) as PostCreateBody | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON body is required.' }, { status: 400 });
  }

  // Phase A: no sharing fan-out. Rejected rather than silently ignored so a
  // Phase B client cannot half-work against a Phase A server.
  if (body.additionalCalendarIds !== undefined) {
    return NextResponse.json({ error: 'Sharing is not available yet.' }, { status: 400 });
  }

  const calendarId = typeof body.calendarId === 'string' ? body.calendarId.trim() : '';
  if (!calendarId) {
    return NextResponse.json({ error: 'calendarId is required.' }, { status: 400 });
  }

  // Tenancy boundary (hardening item 1): never create a post into a calendar
  // hanging off another release.
  const calendarCheck = await ensureCalendarInRelease(adminClient, calendarId, releaseId);
  if ('error' in calendarCheck) return calendarCheck.error;

  if (!isValidScheduledDate(body.scheduledDate)) {
    return NextResponse.json(
      { error: 'scheduledDate is required and must use YYYY-MM-DD format.' },
      { status: 400 }
    );
  }

  const title = validatePostTitle(body.title);
  if (title.error) {
    return NextResponse.json({ error: title.error }, { status: 400 });
  }

  const caption = validatePostCaption(body.caption);
  if (caption.error) {
    return NextResponse.json({ error: caption.error }, { status: 400 });
  }

  if (body.format !== undefined && !isValidPostFormat(body.format)) {
    return NextResponse.json(
      { error: 'Pick a format from the list.' },
      { status: 400 }
    );
  }

  if (body.status !== undefined && !isValidPostStatus(body.status)) {
    return NextResponse.json(
      { error: 'Status must be Draft, Ready or Posted.' },
      { status: 400 }
    );
  }

  if (body.pillar !== undefined && body.pillar !== null && !isValidPostPillar(body.pillar)) {
    return NextResponse.json(
      { error: 'Pick a pillar from the list, or leave it empty.' },
      { status: 400 }
    );
  }

  const insertResult = await adminClient
    .from(CONTENT_POSTS_TABLE)
    .insert({
      // The RELEASE owner, not the acting teammate: the row must survive the
      // teammate's account (auth.users delete-cascade) and stay visible to
      // the owner's RLS/export, which key on this column.
      owner_user_id: ownership.release.ownerUserId,
      calendar_id: calendarId,
      release_id: releaseId,
      shared_group_id: null,
      scheduled_date: body.scheduledDate,
      title: title.value,
      caption: caption.value,
      format: isValidPostFormat(body.format) ? body.format : 'video',
      status: isValidPostStatus(body.status) ? body.status : 'draft',
      pillar: isValidPostPillar(body.pillar) ? body.pillar : null,
    })
    .select('*')
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    return NextResponse.json(
      { error: insertResult.error?.message || 'Could not create post.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { post: toContentPost(insertResult.data as Record<string, unknown>) },
    { status: 201 }
  );
}
