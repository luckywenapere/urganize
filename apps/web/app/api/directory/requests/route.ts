import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import {
  MAX_OPEN_REQUESTS_PER_TEAM,
  RECIPIENT_REQUEST_FIELDS,
  SENDER_REQUEST_FIELDS,
  parseWorkRequestInput,
  revealsContact,
  withinOpenRequestCap,
  type WorkRequestStatus,
} from '@/lib/work-requests';
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
 * NEITHER SIDE IS BEHIND THE MANAGER GATE that /api/directory carries.
 * Searching is Manager and up; being listed and answering are free on every
 * tier, which is the founder's supply-free/demand-paid rule. A Solo person who
 * is listed has to be able to read their own inbox.
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
  rows: Record<string, unknown>[]
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

  return rows.map((row) => {
    const userId = String(row.recipient_user_id || '');
    const profile = profiles.get(userId);
    return {
      ...row,
      recipient_name: profile?.name || 'Somebody in the directory',
      recipient_slug: profile?.isPublic ? profile.slug : '',
      contact_email: contacts.get(userId) || '',
    };
  });
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

  const query =
    box === 'received'
      ? adminClient
          .from(WORK_REQUESTS_TABLE)
          // The column list is the privacy rule, not a projection: see
          // RECIPIENT_REQUEST_FIELDS. It does not carry the release.
          .select(RECIPIENT_REQUEST_FIELDS.join(', '))
          .eq('recipient_user_id', auth.user.id)
      : adminClient
          .from(WORK_REQUESTS_TABLE)
          .select(SENDER_REQUEST_FIELDS.join(', '))
          .eq('sender_user_id', auth.user.id);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(100);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not read your requests.' },
      { status: 500 }
    );
  }

  const requests = (data || []).map(asRow);
  return NextResponse.json({
    box,
    requests: box === 'sent' ? await decorateSentRequests(adminClient, requests) : requests,
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
    .select('user_id, display_name, visibility')
    .eq('user_id', input.recipientUserId)
    .neq('visibility', 'private')
    .maybeSingle();

  if (!recipient) {
    return NextResponse.json({ error: 'That person is not listed.' }, { status: 404 });
  }

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);

  // The cap counts OPEN requests only, so a team that follows up on what it
  // sent is never blocked. Fails open on an unreadable count.
  const { count, error: countError } = await adminClient
    .from(WORK_REQUESTS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', team.primaryWorkspaceId)
    .eq('status', 'new');

  if (!withinOpenRequestCap(countError ? null : count ?? 0)) {
    return NextResponse.json(
      {
        error: `You have ${MAX_OPEN_REQUESTS_PER_TEAM} requests still waiting. Give those a chance first.`,
      },
      { status: 409 }
    );
  }

  const senderName = auth.user.user_metadata?.name || auth.user.email || 'Someone on Urganize';

  const { data, error } = await adminClient
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
    })
    .select(SENDER_REQUEST_FIELDS.join(', '))
    .maybeSingle();

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
  });

  return NextResponse.json({ request: asRow(data) }, { status: 201 });
}
