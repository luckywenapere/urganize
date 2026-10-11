import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeReleaseSlug } from '@/lib/release-ops';
import {
  checkArtistAllowance,
  createWorkspaceArtist,
  listWorkspaceArtists,
} from '@/lib/artists-server';
import { checkActiveReleaseAllowance } from '@/lib/release-cap-server';
import { checkSeatAllowance, recordLimitHit } from '@/lib/seats-server';
import { writePlannerPending } from '@/lib/release-planner-pending';
import { writeTemplatePending } from '@/lib/release-template-pending';
import { isReleasePlannerEnabled } from '@/lib/release-planning';
import {
  decideSharedRollout,
  decideTaskLink,
  sharedRolloutTitle,
  type ShareBlock,
  type TaskLinkDecision,
} from '@/lib/work-request-collab';

/**
 * The I/O half of "say yes and the work starts". The rules are in
 * lib/work-request-collab.ts and the model (why an artist-scoped teammate, why
 * a freelancer gets no seat) is argued in its header; read that first.
 *
 * Declared table names rather than imports from app/api/*: a lib module must
 * not depend on a route group.
 *
 * NEVER THROWS. A failure comes back as a value so the answer route can revert
 * the status it just recorded and tell the person plainly, instead of leaving a
 * yes that did nothing.
 */

const WORKSPACES_TABLE = 'workspaces';
const MEMBERS_TABLE = 'workspace_members';
const RELEASES_TABLE = 'releases';
const RELEASE_METADATA_TABLE = 'release_metadata';
const RELEASE_EVENTS_TABLE = 'release_events';
const PERSON_PROFILES_TABLE = 'person_profiles';
const TASKS_TABLE = 'tasks';

export type SharedRolloutResult =
  | { ok: true; releaseId: string; artistName: string; addedToTeam: boolean }
  | { ok: false; block: ShareBlock }
  | { ok: false; error: string };

const normalizeEmail = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

async function lookupSenderEmail(admin: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return normalizeEmail(data?.user?.email);
  } catch {
    return '';
  }
}

/** Who this artist is called on the manager's roster: the name on their own
 *  directory record when they have one, else the name they sent the ask under. */
async function lookupArtistName(
  admin: SupabaseClient,
  senderUserId: string,
  senderName: string
): Promise<string> {
  try {
    const { data } = await admin
      .from(PERSON_PROFILES_TABLE)
      .select('display_name')
      .eq('user_id', senderUserId)
      .maybeSingle();
    const name = typeof data?.display_name === 'string' ? data.display_name.trim() : '';
    if (name) return name.slice(0, 120);
  } catch {
    // Fall through to the name on the request.
  }
  return senderName.trim().slice(0, 120);
}

export async function startSharedRollout(
  admin: SupabaseClient,
  input: {
    /** The manager saying yes. */
    acceptorUserId: string;
    /** The acceptor's own team, resolved by the route. */
    workspaceId: string | null;
    senderUserId: string;
    senderName: string;
    askReleaseNote: string | null;
  }
): Promise<SharedRolloutResult> {
  try {
    if (!input.workspaceId) {
      return {
        ok: false,
        block: {
          code: 'not_team_manager',
          message: 'You need a team to take somebody on. Pass on this one, or set one up first.',
        },
      };
    }
    const workspaceId = input.workspaceId;

    const [workspaceResult, roleResult] = await Promise.all([
      admin.from(WORKSPACES_TABLE).select('id, owner_id').eq('id', workspaceId).maybeSingle(),
      admin
        .from(MEMBERS_TABLE)
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', input.acceptorUserId)
        .eq('status', 'active')
        .maybeSingle(),
    ]);
    if (workspaceResult.error || !workspaceResult.data) {
      return { ok: false, error: 'Could not read your team.' };
    }
    const ownerId = String(workspaceResult.data.owner_id || '');
    const teamRole =
      ownerId === input.acceptorUserId
        ? 'owner'
        : typeof roleResult.data?.role === 'string'
          ? roleResult.data.role
          : null;

    const artistName = await lookupArtistName(admin, input.senderUserId, input.senderName);
    if (!artistName) return { ok: false, error: 'Could not tell who this is.' };
    const senderEmail = await lookupSenderEmail(admin, input.senderUserId);
    if (!senderEmail) return { ok: false, error: 'Could not reach their account.' };

    // Their membership, found by account first and by invite address second: a
    // pending invite to this address is the same person and must not collide
    // with the unique (workspace, email) index.
    let memberRow: { id: string; user_id: string | null; artist_scope_id: string | null } | null =
      null;
    const byUser = await admin
      .from(MEMBERS_TABLE)
      .select('id, user_id, artist_scope_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', input.senderUserId)
      .neq('status', 'removed')
      .maybeSingle();
    if (byUser.error) return { ok: false, error: 'Could not read your team.' };
    memberRow = byUser.data ?? null;
    if (!memberRow) {
      const byEmail = await admin
        .from(MEMBERS_TABLE)
        .select('id, user_id, artist_scope_id')
        .eq('workspace_id', workspaceId)
        .eq('email', senderEmail)
        .neq('status', 'removed')
        .maybeSingle();
      if (byEmail.error) return { ok: false, error: 'Could not read your team.' };
      memberRow = byEmail.data ?? null;
    }

    const roster = await listWorkspaceArtists(admin, workspaceId);
    const slug = normalizeReleaseSlug(artistName);
    const rosterArtist = roster.find((artist) => artist.slug === slug) ?? null;

    // Only ask a ceiling a question the plan will actually put to it, so a
    // team already at its seat limit is not refused for somebody it already
    // holds a seat for.
    const [seats, artists, releases] = await Promise.all([
      memberRow ? Promise.resolve(null) : checkSeatAllowance(admin, workspaceId),
      rosterArtist ? Promise.resolve(null) : checkArtistAllowance(admin, workspaceId),
      checkActiveReleaseAllowance(admin, ownerId || input.acceptorUserId),
    ]);

    const plan = decideSharedRollout({
      teamRole,
      existingMember: memberRow ? { scopeArtistId: memberRow.artist_scope_id } : null,
      rosterArtistId: rosterArtist?.id ?? null,
      seats,
      artists,
      releases: releases.verdict,
    });

    if (!plan.ok) {
      // The same signal the invite and create routes leave behind: a limit hit
      // is the clearest buy intent the product produces.
      const verdict =
        plan.block.code === 'seat_limit'
          ? seats
          : plan.block.code === 'artist_limit'
            ? artists
            : plan.block.code === 'rollout_limit'
              ? releases.verdict
              : null;
      if (verdict && !verdict.allowed) {
        await recordLimitHit(admin, {
          workspaceId,
          ownerUserId: ownerId || null,
          actorUserId: input.acceptorUserId,
          key: verdict.key,
          limit: verdict.limit,
          current: verdict.current,
        });
      }
      return { ok: false, block: plan.block };
    }

    // 1. The artist on the roster.
    let artistId = rosterArtist?.id ?? '';
    if (plan.createArtist) {
      const created = await createWorkspaceArtist(admin, {
        workspaceId,
        ownerUserId: ownerId || input.acceptorUserId,
        name: artistName,
      });
      if (created.data) {
        artistId = created.data.id;
      } else if (created.conflict) {
        // A race with another yes, or a slug the list read missed: use theirs.
        const again = await listWorkspaceArtists(admin, workspaceId);
        artistId = again.find((artist) => artist.slug === slug)?.id ?? '';
      }
      if (!artistId) return { ok: false, error: created.error || 'Could not add them to your roster.' };
    }

    // 2. The artist on the team, limited to their own artist.
    const now = new Date().toISOString();
    if (plan.addMember) {
      const inserted = await admin.from(MEMBERS_TABLE).insert({
        workspace_id: workspaceId,
        user_id: input.senderUserId,
        email: senderEmail,
        role: 'member',
        status: 'active',
        invited_at: now,
        joined_at: now,
        artist_scope_id: artistId,
      });
      if (inserted.error && String((inserted.error as { code?: string }).code) !== '23505') {
        return { ok: false, error: 'Could not add them to your team.' };
      }
    } else if (memberRow && !memberRow.user_id) {
      // A pending invite to this address: claim it for the account that said
      // yes rather than leaving a second, dead row.
      const claimed = await admin
        .from(MEMBERS_TABLE)
        .update({
          user_id: input.senderUserId,
          status: 'active',
          joined_at: now,
          updated_at: now,
          artist_scope_id: memberRow.artist_scope_id ?? artistId,
        })
        .eq('id', memberRow.id);
      if (claimed.error) return { ok: false, error: 'Could not add them to your team.' };
    }

    // 3. The shared rollout, under that artist. It mirrors the dateless path of
    // POST /api/releases: with the planner on the manager is offered the plan,
    // otherwise the activities arrive the moment a date lands. Nothing here
    // moves an existing rollout, and nothing is sent to the artist's own team.
    const title = sharedRolloutTitle(artistName);
    const plannerPending = isReleasePlannerEnabled();
    const inserted = await admin
      .from(RELEASES_TABLE)
      .insert({
        owner_user_id: ownerId || input.acceptorUserId,
        artist_id: artistId || rosterArtist?.id || null,
        artist_name: artistName,
        title,
        slug: normalizeReleaseSlug(title) || `release-${Date.now()}`,
        release_date: null,
        status: 'draft',
        release_type: 'single',
        description: input.askReleaseNote,
        metadata: plannerPending
          ? writePlannerPending(null, true)
          : writeTemplatePending(null, true),
        updated_at: now,
      })
      .select('id')
      .single();
    if (inserted.error || !inserted.data?.id) {
      return { ok: false, error: 'Could not start the rollout.' };
    }
    const releaseId = String(inserted.data.id);

    // The same two follow-up rows a created rollout always has. A failure here
    // leaves a rollout the manager can still open, so it is logged and carried
    // past rather than undone.
    const metadata = await admin.from(RELEASE_METADATA_TABLE).insert({
      release_id: releaseId,
      primary_artist_name: artistName,
      release_title: title,
      updated_at: now,
    });
    if (metadata.error) console.warn('[work-request-collab] metadata row failed:', metadata.error.message);
    const event = await admin.from(RELEASE_EVENTS_TABLE).insert({
      release_id: releaseId,
      type: 'release_created',
      payload_json: { title, artistName, via: 'directory_request' },
    });
    if (event.error) console.warn('[work-request-collab] event row failed:', event.error.message);

    return { ok: true, releaseId, artistName, addedToTeam: plan.addMember };
  } catch (error) {
    console.error('[work-request-collab] could not start a shared rollout:', error);
    return { ok: false, error: 'Could not start the rollout.' };
  }
}

export type TaskAssignOutcome = TaskLinkDecision | 'no_profile' | 'error';

/**
 * Records the person who said yes on the activity they were asked about.
 *
 * Writes `tasks.assigned_person_id`, the Relationships link that "nothing
 * writes yet", and nothing else: no user is assigned, no seat is taken, no
 * access is granted. The write is conditional on the column still being empty,
 * so a person already recorded there is never overwritten and two answers
 * cannot both land.
 */
export async function assignPersonToTask(
  admin: SupabaseClient,
  input: { taskId: string; requestReleaseId: string | null; recipientUserId: string }
): Promise<TaskAssignOutcome> {
  try {
    const [personResult, taskResult] = await Promise.all([
      admin.from(PERSON_PROFILES_TABLE).select('id').eq('user_id', input.recipientUserId).maybeSingle(),
      admin
        .from(TASKS_TABLE)
        .select('id, release_id, assigned_person_id')
        .eq('id', input.taskId)
        .maybeSingle(),
    ]);
    if (personResult.error || taskResult.error) return 'error';
    const personId = typeof personResult.data?.id === 'string' ? personResult.data.id : '';
    if (!personId) return 'no_profile';

    const row = taskResult.data;
    const decision = decideTaskLink({
      task: row
        ? {
            releaseId: typeof row.release_id === 'string' ? row.release_id : null,
            assignedPersonId:
              typeof row.assigned_person_id === 'string' ? row.assigned_person_id : null,
          }
        : null,
      requestReleaseId: input.requestReleaseId,
    });
    if (decision !== 'link') return decision;

    const updated = await admin
      .from(TASKS_TABLE)
      .update({ assigned_person_id: personId })
      .eq('id', input.taskId)
      .is('assigned_person_id', null)
      .select('id')
      .maybeSingle();
    if (updated.error) return 'error';
    return updated.data ? 'link' : 'already_taken';
  } catch (error) {
    console.error('[work-request-collab] could not link the task:', error);
    return 'error';
  }
}
