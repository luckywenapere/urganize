import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import {
  loadSharedReleaseTitles,
  loadStartKindsForReceived,
} from '@/lib/work-request-start-server';
import {
  LEGACY_RECIPIENT_REQUEST_FIELDS,
  LEGACY_SENDER_REQUEST_FIELDS,
  MAX_OPEN_REQUESTS_PER_TEAM,
  RECIPIENT_REQUEST_FIELDS,
  SENDER_REQUEST_FIELDS,
  canReceiveRequests,
  parseWorkRequestInput,
  refusalForClosedAvailability,
  revealsContact,
  withEffectiveStatus,
  withinOpenRequestCap,
  workRequestCutoff,
  type WorkRequestStatus,
} from '@/lib/work-requests';
import { expireStaleRequestsForPair } from '@/lib/work-request-expiry-server';
import { notifyWorkRequest } from '@/lib/work-requests-server';
import {
  PERSON_PROFILES_TABLE,
  WORK_REQUESTS_TABLE,
  asRow,
  createAdminClient,
  directoryDisabledResponse,
  isWorkRequestsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../_shared';

/**
 * Reaching out to somebody in the directory, and reading what came back.
 *
 * GET returns one side at a time (`?box=received` or `?box=sent`), because the
 * two are different shapes: a received request is answerable and deliberately
 * carries no release, a sent one carries the release it was for.
 *
 * NEITHER SIDE IS GATED ON A PLAN. Searching, being listed and answering are
 * open on every plan (strategy doc, section 10, 2026-10-02; searching was
 * Manager and up before that). A Solo person who is listed has to be able to
 * read their own inbox.
 */

/**
 * Fills in who the sender asked, and — only where they said yes — how to reach
 * them.
 *
 * THE CONTACT IS RESOLVED HERE AND STORED NOWHERE. `revealsContact` is the
 * consent rule: an interested answer is the permission to be contacted, a pass
 * and a waiting request reveal nothing. Keeping it out of the table means the
 * reveal cannot outlive the consent, and it is why the address lookup is
 * filtered before it runs rather than done for every row.
 *
 * Never throws: a request whose recipient could not be resolved still lists,
 * with a name of last resort. The row is the record; this is decoration on it.
 */
async function decorateSentRequests(
  adminClient: SupabaseClient,
  rows: Record<string, unknown>[],
  viewerUserId: string
): Promise<Record<string, unknown>[]> {
  const recipientIds = [
    ...new Set(rows.map((row) => String(row.recipient_user_id || '')).filter(Boolean)),
  ];
  if (recipientIds.length === 0) return rows;

  // One query for every name rather than one per row.
  const profiles = new Map<string, { name: string; slug: string; isPublic: boolean }>();
  try {
    const { data } = await adminClient
      .from(PERSON_PROFILES_TABLE)
      .select('user_id, display_name, slug, visibility')
      .in('user_id', recipientIds);
    for (const entry of data || []) {
      const row = asRow(entry);
      profiles.set(String(row.user_id || ''), {
        name: String(row.display_name || ''),
        slug: typeof row.slug === 'string' ? row.slug : '',
        isPublic: row.visibility === 'public',
      });
    }
  } catch {
    // A missing name is a worse list, not a broken one.
  }

  // Bounded by the consent rule, so this is a handful of lookups on a page of
  // a hundred rows rather than a hundred.
  const contactIds = [
    ...new Set(
      rows
        .filter((row) => revealsContact(String(row.status || 'new') as WorkRequestStatus))
        .map((row) => String(row.recipient_user_id || ''))
        .filter(Boolean)
    ),
  ];
  const contacts = new Map<string, string>();
  await Promise.all(
    contactIds.map(async (userId) => {
      try {
        const { data } = await adminClient.auth.admin.getUserById(userId);
        const email = data?.user?.email;
        if (email) contacts.set(userId, email);
      } catch {
        // Same posture: no address is a row you cannot act on yet, not an error.
      }
    })
  );

  // The rollout an accepted request started, but only where THIS person can
  // open it: see loadSharedReleaseTitles. Without a title the id is dropped
  // too, so a list never points somebody at something they cannot reach.
  const sharedTitles = await loadSharedReleaseTitles(
    adminClient,
    viewerUserId,
    rows.map((row) => String(row.shared_release_id || '')).filter(Boolean)
  );

  return rows.map((row) => {
    const userId = String(row.recipient_user_id || '');
    const profile = profiles.get(userId);
    const sharedId = String(row.shared_release_id || '');
    const sharedTitle = sharedTitles.get(sharedId) || '';
    return {
      ...row,
      shared_release_id: sharedTitle ? sharedId : null,
      shared_release_title: sharedTitle,
      recipient_name: profile?.name || 'Somebody in the directory',
      recipient_slug: profile?.isPublic ? profile.slug : '',
      contact_email: contacts.get(userId) || '',
    };
  });
}

/** Postgres "undefined column": the migration that adds the spec's request
 *  fields has not been applied, so the read retries with the columns that
 *  always existed. The inbox must keep working between a deploy and a
 *  hand-applied migration. */
function isUndefinedColumn(error: { code?: string } | null): boolean {
  return String(error?.code || '') === '42703';
}

export async function GET(request: NextRequest) {
  if (!isWorkRequestsFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const box = new URL(request.url).searchParams.get('box') === 'sent' ? 'sent' : 'received';

  const read = (fields: readonly string[]) =>
    box === 'received'
      ? adminClient
          .from(WORK_REQUESTS_TABLE)
          // The column list is the privacy rule, not a projection: see
          // RECIPIENT_REQUEST_FIELDS. It does not carry the release.
          .select(fields.join(', '))
          .eq('recipient_user_id', auth.user.id)
          .order('created_at', { ascending: false })
          .limit(100)
      : adminClient
          .from(WORK_REQUESTS_TABLE)
          .select(fields.join(', '))
          .eq('sender_user_id', auth.user.id)
          .order('created_at', { ascending: false })
          .limit(100);

  let { data, error } = await read(
    box === 'received' ? RECIPIENT_REQUEST_FIELDS : SENDER_REQUEST_FIELDS
  );
  if (error && isUndefinedColumn(error)) {
    ({ data, error } = await read(
      box === 'received' ? LEGACY_RECIPIENT_REQUEST_FIELDS : LEGACY_SENDER_REQUEST_FIELDS
    ));
  }

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not read your requests.' },
      { status: 500 }
    );
  }

  // A request still marked waiting after its seven days is read as closed, so
  // the lists are right before the daily sweep has got to it.
  const requests = withEffectiveStatus((data || []).map(asRow));

  if (box === 'sent') {
    return NextResponse.json({
      box,
      requests: await decorateSentRequests(adminClient, requests, auth.user.id),
    });
  }

  // What saying yes could start, per waiting request. A word for the button and
  // never the rollout behind it: the recipient does not see release_id.
  const kinds = await loadStartKindsForReceived(adminClient, requests);
  return NextResponse.json({
    box,
    requests: requests.map((row) => ({ ...row, start_kind: kinds.get(String(row.id || '')) ?? null })),
  });
}

export async function POST(request: NextRequest) {
  if (!isWorkRequestsFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const parsed = parseWorkRequestInput(await request.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { input } = parsed;

  if (input.recipientUserId === auth.user.id) {
    return NextResponse.json({ error: 'You cannot ask yourself.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // They have to be listed. Somebody who never opted in, or who closed their
  // record, is not reachable — and answering "not found" rather than "they are
  // private" keeps the two indistinguishable.
  const { data: recipient } = await adminClient
    .from(PERSON_PROFILES_TABLE)
    .select('user_id, display_name, visibility, availability')
    .eq('user_id', input.recipientUserId)
    .neq('visibility', 'private')
    .maybeSingle();

  if (!recipient) {
    return NextResponse.json({ error: 'That person is not listed.' }, { status: 404 });
  }

  // "Not taking work" is enforced here and not only by hiding the button,
  // because a request is a plain API call and the button is a courtesy. A
  // listed person who has closed their availability cannot be asked, and the
  // sender is told why rather than having it quietly sit unanswered.
  if (!canReceiveRequests(asRow(recipient).availability as string | null)) {
    return NextResponse.json(
      { error: refusalForClosedAvailability(String(asRow(recipient).display_name || '')) },
      { status: 409 }
    );
  }

  // A request that names a rollout has to name one the sender can work on.
  // Before this the id was stored unchecked, which was harmless while nothing
  // acted on it; an accepted request now puts somebody on that rollout's team,
  // so a made-up or foreign id must stop here. The same team-write rule every
  // rollout scene uses, so a teammate may ask on the team's behalf and a guest
  // may not. A refusal is a flat 404, indistinguishable from "not there".
  if (input.releaseId) {
    const access = await ensureReleaseTeamWriteAccess(adminClient, input.releaseId, auth.user);
    if ('error' in access) return access.error;
  }
  if (input.taskId && input.releaseId) {
    const { data: task } = await adminClient
      .from('tasks')
      .select('id')
      .eq('id', input.taskId)
      .eq('release_id', input.releaseId)
      .maybeSingle();
    if (!task) {
      return NextResponse.json({ error: 'That activity is not on that rollout.' }, { status: 400 });
    }
  }

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);

  // The cap counts OPEN requests only, so a team that follows up on what it
  // sent is never blocked. A request past its seven days is closed even if the
  // daily sweep has not got to it, so it does not count. Fails open on an
  // unreadable count.
  const { count, error: countError } = await adminClient
    .from(WORK_REQUESTS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', team.primaryWorkspaceId)
    .eq('status', 'new')
    .gte('created_at', workRequestCutoff());

  if (!withinOpenRequestCap(countError ? null : count ?? 0)) {
    return NextResponse.json(
      {
        error: `You have ${MAX_OPEN_REQUESTS_PER_TEAM} requests still waiting. Give those a chance first.`,
      },
      { status: 409 }
    );
  }

  const senderName = auth.user.user_metadata?.name || auth.user.email || 'Someone on Urganize';

  // Close this team's stale ask to this person for this role first. The partial
  // unique index counts a request that has run out its seven days until the
  // daily sweep closes it, and "you already asked" for something that closed
  // days ago is the one answer a sender could not act on.
  await expireStaleRequestsForPair(adminClient, {
    workspaceId: team.primaryWorkspaceId,
    recipientUserId: input.recipientUserId,
    role: input.role,
  });

  // The spec's extra fields are written only when they carry something, so a
  // plain ask sends exactly the row it always did and keeps working before the
  // migration that adds the columns is applied.
  const extras: Record<string, unknown> = {};
  if (input.nextRelease) extras.next_release = input.nextRelease;
  if (input.links.length > 0) extras.links = input.links;
  if (input.taskId) extras.task_id = input.taskId;

  const { data: inserted, error } = await adminClient
    .from(WORK_REQUESTS_TABLE)
    .insert({
      sender_user_id: auth.user.id,
      recipient_user_id: input.recipientUserId,
      workspace_id: team.primaryWorkspaceId,
      role: input.role,
      note: input.note,
      release_id: input.releaseId,
      // Denormalised so the recipient's read path cannot touch profiles or
      // workspaces. Written server-side, never accepted from the client.
      sender_name: String(senderName).slice(0, 120),
      sender_team: team.teamName ? String(team.teamName).slice(0, 120) : null,
      ...extras,
    })
    .select('id')
    .maybeSingle();

  if (error && isUndefinedColumn(error) && Object.keys(extras).length > 0) {
    // Fields that cannot be stored are not silently dropped: a manager ask
    // without its next release would reach the person as something else.
    return NextResponse.json(
      { error: 'Requests are being updated. Try again in a few minutes.' },
      { status: 503 }
    );
  }

  if (error) {
    // The one collision somebody can act on: they already have this exact ask
    // out to this person and it has not been answered.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'You already asked them about this. Wait for an answer.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Could not send that.' },
      { status: 500 }
    );
  }

  // Best effort, and deliberately after the row: the ask is recorded whether
  // or not the mail goes out.
  await notifyWorkRequest(adminClient, {
    recipientUserId: input.recipientUserId,
    senderName: String(senderName),
    role: input.role,
    note: input.note,
    nextRelease: input.nextRelease,
    links: input.links,
  });

  // Read the row back through the same two column lists the GET uses, so a
  // missing column never fails a send that has already been recorded.
  const insertedId = String(asRow(inserted).id || '');
  let created = await adminClient
    .from(WORK_REQUESTS_TABLE)
    .select(SENDER_REQUEST_FIELDS.join(', '))
    .eq('id', insertedId)
    .maybeSingle();
  if (created.error && isUndefinedColumn(created.error)) {
    created = await adminClient
      .from(WORK_REQUESTS_TABLE)
      .select(LEGACY_SENDER_REQUEST_FIELDS.join(', '))
      .eq('id', insertedId)
      .maybeSingle();
  }

  return NextResponse.json({ request: asRow(created.data) }, { status: 201 });
}
