import type { SupabaseClient, User } from '@supabase/supabase-js';
import { DEFAULT_RELEASE_TITLE } from '../types/releases';
import { normalizeReleaseSlug } from './release-ops';
import { writePlannerPending } from './release-planner-pending';
import { writeTemplatePending } from './release-template-pending';
import { isReleasePlannerEnabled } from './release-planning';
import { checkArtistAllowance, createWorkspaceArtist } from './artists-server';
import { checkActiveReleaseAllowance } from './release-cap-server';
import { checkSeatAllowance, countHireMembers, recordLimitHit } from './seats-server';
import { isTeamAssignee } from './task-assignee-server';
import { ensureOwnedWorkspace } from './tasks-server';
import {
  buildStartMemberRow,
  hireHasRoom,
  type StartRefusal,
  type StartResult,
} from './work-request-start';
import { WORK_REQUEST_NEXT_RELEASE_MAX_CHARS, startKindFor, type WorkRequestStartKind } from './work-requests';

/**
 * The I/O half of "accept and start" (directory spec, "From profile to working
 * together"). The rules and the sentences are in lib/work-request-start.ts; this
 * reads and writes.
 *
 * It runs AFTER the yes has been saved. The answer route claims the request row
 * first (a conditional update, so two taps cannot both win) and only then calls
 * this, so a failure here can never lose the answer: the person who said yes is
 * told what happened and the request stays answered either way.
 *
 * Nothing here throws. Every failure is a `not_started` with a reason, because
 * the caller's job is to tell somebody what happened to their yes, and a 500
 * that hides the saved answer is the worst version of that.
 */

const RELEASES_TABLE = 'releases';
const RELEASE_METADATA_TABLE = 'release_metadata';
const RELEASE_EVENTS_TABLE = 'release_events';
const WORKSPACE_MEMBERS_TABLE = 'workspace_members';
const WORK_REQUESTS_TABLE = 'work_requests';
const TASKS_TABLE = 'tasks';

/** The slice of a request row this needs. All of it is set by the server when
 *  the request was sent, none of it comes from the answer. */
export type StartRequestRow = {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  workspace_id: string | null;
  role: string;
  release_id: string | null;
  task_id: string | null;
  next_release: string | null;
  sender_name: string;
};

const notStarted = (
  kind: WorkRequestStartKind,
  reason: StartRefusal,
  detail: string | null = null
): StartResult => ({ status: 'not_started', kind, reason, detail });

function isUndefinedColumn(error: unknown): boolean {
  return String((error as { code?: string } | null)?.code || '') === '42703';
}

/**
 * Start the shared rollout for a request that was just answered "interested".
 * Returns null when this request has nothing to start (a plain ask with no
 * rollout behind it), which is most of them.
 */
export async function startWorkFromRequest(
  admin: SupabaseClient,
  request: StartRequestRow,
  answerer: User
): Promise<StartResult | null> {
  const kind = startKindFor({ role: request.role, releaseId: request.release_id });
  if (!kind) return null;

  try {
    const result =
      kind === 'manager_rollout'
        ? await startManagerRollout(admin, request, answerer)
        : await startHireJoin(admin, request, answerer);

    if (result.status === 'started') {
      const { error } = await admin
        .from(WORK_REQUESTS_TABLE)
        .update({ shared_release_id: result.releaseId, started_at: new Date().toISOString() })
        .eq('id', request.id)
        .is('started_at', null);
      if (error) {
        // The rollout exists and the person is on it; losing the pointer only
        // costs the "shared rollouts started" count and the sender's link.
        console.error('[work-request-start] could not record the shared rollout:', error.message);
      }
    }
    return result;
  } catch (error) {
    console.error('[work-request-start] start failed:', error);
    return notStarted(kind, 'failed');
  }
}

// ── A manager says yes to an artist ──────────────────────────────────────────

/**
 * An artist asked a manager to manage their next release and the manager said
 * yes: make the rollout in the MANAGER'S team, under the artist, and put the
 * artist on it.
 *
 * Why the manager's team and not the artist's: a manager runs releases for a
 * roster, and this is the moment the artist joins that roster. The rollout is
 * left dateless and un-planned (the same state a rollout made from the Catalogue
 * starts in), so the manager plans it with UrgAns the way they would any other.
 *
 * The artist takes a SEAT, on purpose. Signing an artist is what the manager
 * plans are for, and the seat cap here is the upgrade path (see the header of
 * lib/work-request-start.ts). If the plan has no free seat the rollout still
 * starts and the manager is told to make one: refusing the whole yes over one
 * seat would throw away the one thing that already happened.
 */
async function startManagerRollout(
  admin: SupabaseClient,
  request: StartRequestRow,
  manager: User
): Promise<StartResult> {
  const kind: WorkRequestStartKind = 'manager_rollout';

  const workspace = await ensureOwnedWorkspace(admin, manager);

  // The same ceiling POST /api/releases applies, asked of the same person.
  const cap = await checkActiveReleaseAllowance(admin, manager.id);
  if (!cap.verdict.allowed) {
    await recordLimitHit(admin, {
      workspaceId: cap.workspaceId ?? workspace.id,
      ownerUserId: manager.id,
      actorUserId: manager.id,
      key: cap.verdict.key,
      limit: cap.verdict.limit,
      current: cap.verdict.current,
    });
    return notStarted(kind, 'rollout_limit', cap.verdict.message);
  }

  // The artist: the manager's existing artist of that name, or a new one.
  const artistName = request.sender_name.trim() || 'New artist';
  const slug = normalizeReleaseSlug(artistName);
  const existing = slug
    ? await admin
        .from('artists')
        .select('id,name')
        .eq('workspace_id', workspace.id)
        .eq('slug', slug)
        .maybeSingle()
    : { data: null, error: null };
  if (existing.error) throw existing.error;

  let artistId = existing.data?.id ? String(existing.data.id) : '';
  let resolvedArtistName = existing.data?.name ? String(existing.data.name) : artistName;

  if (!artistId) {
    // Same ceiling as the other two places an artist is made.
    const allowance = await checkArtistAllowance(admin, workspace.id);
    if (!allowance.allowed) {
      await recordLimitHit(admin, {
        workspaceId: workspace.id,
        ownerUserId: manager.id,
        actorUserId: manager.id,
        key: allowance.key,
        limit: allowance.limit,
        current: allowance.current,
      });
      return notStarted(kind, 'artist_limit', allowance.message);
    }
    const created = await createWorkspaceArtist(admin, {
      workspaceId: workspace.id,
      ownerUserId: manager.id,
      name: artistName,
    });
    if (!created.data) {
      // A race with another request for the same name: take the winner.
      const winner = await admin
        .from('artists')
        .select('id,name')
        .eq('workspace_id', workspace.id)
        .eq('slug', slug)
        .maybeSingle();
      if (!winner.data?.id) throw new Error(created.error || 'Could not add artist.');
      artistId = String(winner.data.id);
      resolvedArtistName = String(winner.data.name || artistName);
    } else {
      artistId = created.data.id;
      resolvedArtistName = created.data.name;
    }
  }

  // The rollout. Titled with what the artist said they are putting out, when
  // they said, so the manager lands on something recognisable.
  const typed = (request.next_release || '').trim().slice(0, WORK_REQUEST_NEXT_RELEASE_MAX_CHARS);
  const title = typed || DEFAULT_RELEASE_TITLE;
  const now = new Date().toISOString();
  // Dateless, so it owes its plan: the planner when that is on, the template
  // otherwise. Exactly POST /api/releases with no date and the default plan.
  const metadata = isReleasePlannerEnabled()
    ? writePlannerPending(null, true)
    : writeTemplatePending(null, true);

  const inserted = await admin
    .from(RELEASES_TABLE)
    .insert({
      owner_user_id: manager.id,
      artist_id: artistId,
      artist_name: resolvedArtistName,
      title,
      slug: normalizeReleaseSlug(title) || `release-${Date.now()}`,
      release_date: null,
      status: 'draft',
      release_type: 'single',
      description: null,
      metadata,
      updated_at: now,
    })
    .select('id,title')
    .single();
  if (inserted.error || !inserted.data?.id) {
    throw inserted.error ?? new Error('Could not create the rollout.');
  }
  const releaseId = String(inserted.data.id);
  const releaseTitle = String(inserted.data.title || title);

  // The same two sidecar rows POST /api/releases writes. Best effort: the
  // rollout is usable without them, and failing the yes over a log row is wrong.
  const meta = await admin.from(RELEASE_METADATA_TABLE).insert({
    release_id: releaseId,
    primary_artist_name: resolvedArtistName,
    release_title: releaseTitle,
    updated_at: now,
  });
  if (meta.error) console.error('[work-request-start] metadata row failed:', meta.error.message);
  const event = await admin.from(RELEASE_EVENTS_TABLE).insert({
    release_id: releaseId,
    type: 'release_created',
    payload_json: { title: releaseTitle, artistName: resolvedArtistName, via: 'directory_request' },
  });
  if (event.error) console.error('[work-request-start] event row failed:', event.error.message);

  // The artist joins the manager's team, scoped to their own artist.
  let personAdded = await isTeamAssignee(admin, workspace.id, request.sender_user_id);
  if (!personAdded) {
    const seats = await checkSeatAllowance(admin, workspace.id);
    if (!seats.allowed) {
      await recordLimitHit(admin, {
        workspaceId: workspace.id,
        ownerUserId: manager.id,
        actorUserId: manager.id,
        key: seats.key,
        limit: seats.limit,
        current: seats.current,
      });
    } else {
      const email = await lookupEmail(admin, request.sender_user_id);
      if (email) {
        personAdded = await addMember(admin, {
          workspaceId: workspace.id,
          userId: request.sender_user_id,
          email,
          artistScopeId: artistId,
          isHire: false,
        });
      }
    }
  }

  return { status: 'started', kind, releaseId, releaseTitle, personAdded, taskTitle: null };
}

// ── A person says yes to a team that asked them to do a job ──────────────────

/**
 * A manager asked somebody to do a job on one of their rollouts and the person
 * said yes: put them on the manager's team as a hire, scoped to that rollout's
 * artist, and make the activity they were asked about theirs.
 */
async function startHireJoin(
  admin: SupabaseClient,
  request: StartRequestRow,
  person: User
): Promise<StartResult> {
  const kind: WorkRequestStartKind = 'hire_join';
  const workspaceId = request.workspace_id;
  const releaseId = request.release_id;
  if (!workspaceId) return notStarted(kind, 'sender_left');
  if (!releaseId) return notStarted(kind, 'release_gone');

  const releaseResult = await admin
    .from(RELEASES_TABLE)
    .select('id,title,owner_user_id,artist_id')
    .eq('id', releaseId)
    .maybeSingle();
  if (releaseResult.error) throw releaseResult.error;
  const release = releaseResult.data as {
    id: string;
    title: string | null;
    owner_user_id: string;
    artist_id: string | null;
  } | null;
  // Gone, or no longer in that team: whoever owns it now, it is not the
  // team that asked.
  if (!release || !(await isTeamAssignee(admin, workspaceId, release.owner_user_id))) {
    return notStarted(kind, 'release_gone');
  }

  // The person who asked may have left in the days it took to answer.
  if (!(await isTeamAssignee(admin, workspaceId, request.sender_user_id))) {
    return notStarted(kind, 'sender_left');
  }

  // A hire is kept to ONE artist's rollouts. Without an artist there is nothing
  // to keep them to, and a member with no scope sees the whole team's work.
  if (!release.artist_id) return notStarted(kind, 'failed');

  let personAdded = await isTeamAssignee(admin, workspaceId, person.id);
  if (!personAdded) {
    const hires = await countHireMembers(admin, workspaceId, { activeOnly: true });
    if (!hireHasRoom(hires)) return notStarted(kind, 'hire_limit');

    const email = (person.email || (await lookupEmail(admin, person.id)) || '').trim();
    if (!email) return notStarted(kind, 'failed');
    personAdded = await addMember(admin, {
      workspaceId,
      userId: person.id,
      email,
      artistScopeId: release.artist_id,
      isHire: true,
    });
    if (!personAdded) return notStarted(kind, 'failed');
  }

  let taskTitle: string | null = null;
  if (request.task_id) {
    taskTitle = await assignTask(admin, {
      taskId: request.task_id,
      releaseId,
      userId: person.id,
    });
  }

  return {
    status: 'started',
    kind,
    releaseId,
    releaseTitle: String(release.title || DEFAULT_RELEASE_TITLE),
    personAdded: true,
    taskTitle,
  };
}

// ── What the lists need to know about starting ───────────────────────────────

/**
 * Which of a person's waiting requests a yes can START something for, as the kind
 * of start. Computed on the server because the answer depends on `release_id`,
 * which the recipient's side may never read: the list gets "this one can start a
 * rollout" or "this one can put you on a rollout" and never which rollout.
 *
 * Only a request that is still waiting is asked about; an answered or closed one
 * has nothing left to start. Never throws: on any failure the map is smaller and
 * the buttons fall back to a plain "Interested".
 */
export async function loadStartKindsForReceived(
  admin: SupabaseClient,
  rows: ReadonlyArray<Record<string, unknown>>
): Promise<Map<string, WorkRequestStartKind>> {
  const kinds = new Map<string, WorkRequestStartKind>();
  const waiting = rows.filter((row) => String(row.status || '') === 'new');
  const needRelease: string[] = [];

  for (const row of waiting) {
    const id = String(row.id || '');
    if (!id) continue;
    if (String(row.role || '') === 'manager') kinds.set(id, 'manager_rollout');
    else needRelease.push(id);
  }
  if (needRelease.length === 0) return kinds;

  try {
    const { data, error } = await admin
      .from(WORK_REQUESTS_TABLE)
      .select('id, release_id')
      .in('id', needRelease);
    if (error) return kinds;
    for (const entry of data || []) {
      const row = entry as { id: string; release_id: string | null };
      if (row.release_id) kinds.set(String(row.id), 'hire_join');
    }
  } catch {
    // No kinds is a plain "Interested", never a broken inbox.
  }
  return kinds;
}

/**
 * The titles of the rollouts a person's accepted requests started, for the sent
 * list: but only for rollouts THEY can open. A manager who accepted an artist's
 * request may not have had a free seat to give, in which case the artist is not
 * on the rollout and is told so in words; handing them its title and a link
 * would show them something they cannot reach.
 *
 * Access is the rule the rest of the product uses at its core: the owner, or an
 * active member of the owner's team. Never throws.
 */
export async function loadSharedReleaseTitles(
  admin: SupabaseClient,
  userId: string,
  releaseIds: string[]
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const ids = [...new Set(releaseIds.filter(Boolean))];
  if (ids.length === 0) return titles;

  try {
    const { data: releases } = await admin
      .from(RELEASES_TABLE)
      .select('id,title,owner_user_id')
      .in('id', ids);
    const rows = (releases || []) as Array<{ id: string; title: string | null; owner_user_id: string }>;
    if (rows.length === 0) return titles;

    const foreignOwners = [...new Set(rows.map((row) => row.owner_user_id).filter((id) => id !== userId))];
    const reachableOwners = new Set<string>();
    if (foreignOwners.length > 0) {
      const { data: workspaces } = await admin
        .from('workspaces')
        .select('id,owner_id')
        .in('owner_id', foreignOwners);
      const owned = (workspaces || []) as Array<{ id: string; owner_id: string }>;
      if (owned.length > 0) {
        const { data: memberships } = await admin
          .from(WORKSPACE_MEMBERS_TABLE)
          .select('workspace_id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .in(
            'workspace_id',
            owned.map((workspace) => workspace.id)
          );
        const memberOf = new Set(
          ((memberships || []) as Array<{ workspace_id: string }>).map((entry) => entry.workspace_id)
        );
        for (const workspace of owned) {
          if (memberOf.has(workspace.id)) reachableOwners.add(workspace.owner_id);
        }
      }
    }

    for (const row of rows) {
      if (row.owner_user_id === userId || reachableOwners.has(row.owner_user_id)) {
        titles.set(String(row.id), String(row.title || DEFAULT_RELEASE_TITLE));
      }
    }
  } catch {
    // A missing title is a request with no link, not a broken list.
  }
  return titles;
}

// ── Shared pieces ────────────────────────────────────────────────────────────

async function lookupEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email?.trim();
    return email || null;
  } catch {
    return null;
  }
}

/**
 * Add somebody to a team as a member. True when they are on it afterwards.
 *
 * The (workspace_id, email) pair is unique, so a person who was invited before,
 * or removed before, collides on insert; that row is brought back to life with
 * the new scope instead. An ACTIVE row is never touched, since the caller has
 * already checked there is not one.
 */
async function addMember(
  admin: SupabaseClient,
  input: {
    workspaceId: string;
    userId: string;
    email: string;
    artistScopeId: string | null;
    isHire: boolean;
  }
): Promise<boolean> {
  const row = buildStartMemberRow(input);
  const inserted = await admin.from(WORKSPACE_MEMBERS_TABLE).insert(row);
  if (!inserted.error) return true;

  // The migration that adds is_hire has not been applied: nothing can be added
  // as a hire yet, and adding one as a full member would take a seat nobody
  // agreed to. A signed artist does not need the column, so retry that one
  // without it.
  if (isUndefinedColumn(inserted.error)) {
    if (input.isHire) return false;
    const { is_hire: _unused, ...legacy } = row;
    void _unused;
    const retried = await admin.from(WORKSPACE_MEMBERS_TABLE).insert(legacy);
    return !retried.error;
  }

  const revived = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .update({
      user_id: input.userId,
      role: row.role,
      status: 'active',
      is_hire: input.isHire,
      artist_scope_id: input.artistScopeId,
      invite_token: null,
      invite_expires_at: null,
      joined_at: row.joined_at,
      updated_at: row.updated_at,
    })
    .eq('workspace_id', input.workspaceId)
    .eq('email', row.email)
    .neq('status', 'active');
  if (revived.error) {
    console.error('[work-request-start] could not add the member:', revived.error.message);
    return false;
  }
  return true;
}

/** Make the activity the person was asked about theirs. Returns its title, or
 *  null when it could not be assigned: the yes already worked without it. */
async function assignTask(
  admin: SupabaseClient,
  input: { taskId: string; releaseId: string; userId: string }
): Promise<string | null> {
  const found = await admin
    .from(TASKS_TABLE)
    .select('id,title,release_id')
    .eq('id', input.taskId)
    .maybeSingle();
  const task = found.data as { id: string; title: string | null; release_id: string | null } | null;
  // Only an activity of THIS rollout: a task id on a request is something the
  // sender typed into a form, and it must not reach into anybody else's work.
  if (found.error || !task || task.release_id !== input.releaseId) return null;

  const updated = await admin
    .from(TASKS_TABLE)
    .update({ assigned_to_user_id: input.userId, updated_at: new Date().toISOString() })
    .eq('id', task.id)
    .eq('release_id', input.releaseId);
  if (updated.error) {
    console.error('[work-request-start] could not assign the activity:', updated.error.message);
    return null;
  }
  return task.title ? String(task.title) : null;
}
