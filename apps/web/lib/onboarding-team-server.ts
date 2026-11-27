// SERVER ONLY. Onboarding's team screen and New project (#854, 29 Oct 2026).
//
// Three jobs, each one request from a phone on bad data:
//   - read where this person stands (their team, invites to their email, the
//     teams they are in) WITHOUT activating or creating anything,
//   - name their own team, or join the team that invited them,
//   - save unfinished music as a record in the making in the team they picked.
// Rollouts still go through POST /api/releases (which now takes the team).
// The rules are pure in lib/onboarding-flow.ts and lib/release-team.ts.

import { randomUUID } from 'crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { claimWorkspaceInvite } from './invite-claims-server';
import { captureActivationIfReached } from './activation-server';
import { ensureOwnedWorkspace, loadProfilesByIds } from './tasks-server';
import { ARTISTS_TABLE, checkArtistAllowance } from './artists-server';
import { normalizeReleaseSlug } from './release-ops';
import { recordLimitHit } from './seats-server';
import { escapeLike } from './access-gate-server';
import { addSong, createRecord } from './next-records-server';
import {
  MAX_TEAM_NAME_LENGTH,
  isSystemTeamName,
  isTeamRole,
  personaForWhoFor,
  resolveTeamName,
  type OnboardingTeamState,
  type TeamInvite,
  type TeamRole,
  type TeamSummary,
  type TeamWhoFor,
} from './onboarding-flow';
import { deriveOnboardingRoleFromPersona, nextProfileRoleForPersona } from './onboarding';

const MEMBERS = 'workspace_members';
const WORKSPACES = 'workspaces';
const INVITE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ROLLOUTS_SHOWN = 3;

export type ServerResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; limitKey?: string };

const fail = (status: number, error: string, limitKey?: string): ServerResult<never> => ({
  ok: false,
  status,
  error,
  ...(limitKey ? { limitKey } : {}),
});

type Row = Record<string, unknown>;
const text = (value: unknown): string => String(value ?? '').trim();
const emailOf = (user: Pick<User, 'email'>): string => text(user.email).toLowerCase();
// Invites match on email case-insensitively. The address is escaped first: an
// unescaped `_` or `%` in a sign-up address is a LIKE wildcard, so
// "j_hn@acme.com" would match (and could join) an invite sent to john@acme.com.
const roleOf = (value: unknown): TeamRole => (isTeamRole(value) ? value : 'member');

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Where a signed-in person stands. Read only: it must not claim an invite or
 * provision a team (the S2 rule: "Must not activate anything"), so it reads
 * the tables directly instead of going through loadWorkspaceAccessContext.
 */
export async function loadOnboardingTeamState(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
  approved: boolean
): Promise<OnboardingTeamState> {
  const email = emailOf(user);
  const [profileResult, memberResult, pendingResult, ownReleases] = await Promise.all([
    admin.from('profiles').select('onboarding_completed,onboarding_persona,role').eq('id', user.id).maybeSingle(),
    admin.from(MEMBERS).select('id,workspace_id,role,status,invited_at').eq('user_id', user.id).eq('status', 'active'),
    email
      ? admin
          .from(MEMBERS)
          .select('id,workspace_id,role,invited_at')
          .ilike('email', escapeLike(email))
          .eq('status', 'invited')
          .is('user_id', null)
      : Promise.resolve({ data: [], error: null }),
    admin.from('releases').select('id', { count: 'exact', head: true }).eq('owner_user_id', user.id).is('deleted_at', null),
  ]);
  if (memberResult.error) throw memberResult.error;

  const profile = (profileResult.data as Row | null) ?? {};
  const memberRows = (memberResult.data ?? []) as Row[];
  const pendingRows = ((pendingResult.data ?? []) as Row[]).filter(
    (row) => !memberRows.some((member) => text(member.workspace_id) === text(row.workspace_id))
  );

  // Artist scopes, read on their own so a missing column never breaks the read.
  const scoped = new Set<string>();
  if (memberRows.length) {
    const scopeResult = await admin
      .from(MEMBERS)
      .select('workspace_id,artist_scope_id')
      .in(
        'id',
        memberRows.map((row) => text(row.id))
      );
    for (const row of (scopeResult.data ?? []) as Row[]) if (row.artist_scope_id) scoped.add(text(row.workspace_id));
  }

  const workspaceIds = Array.from(
    new Set([...memberRows, ...pendingRows].map((row) => text(row.workspace_id)).filter(Boolean))
  );
  const workspaceResult = workspaceIds.length
    ? await admin.from(WORKSPACES).select('id,name,owner_id,created_at').in('id', workspaceIds)
    : { data: [], error: null };
  const workspaces = new Map(((workspaceResult.data ?? []) as Row[]).map((row) => [text(row.id), row]));
  const ownerNames = await loadProfilesByIds(
    admin,
    Array.from(workspaces.values()).map((row) => text(row.owner_id))
  );

  const ownWorkspace = Array.from(workspaces.values())
    .filter((row) => text(row.owner_id) === user.id)
    .sort((a, b) => text(a.created_at).localeCompare(text(b.created_at)))[0];

  const inviterName = (workspaceId: string): string => {
    const ownerId = text(workspaces.get(workspaceId)?.owner_id);
    return text(ownerNames.get(ownerId)?.name) || 'The team owner';
  };

  const invites: TeamInvite[] = [
    ...pendingRows.map((row) => ({
      workspaceId: text(row.workspace_id),
      teamName: text(workspaces.get(text(row.workspace_id))?.name) || 'A team',
      inviterName: inviterName(text(row.workspace_id)),
      role: roleOf(row.role),
      joined: false,
      invitedAt: text(row.invited_at),
    })),
    // An email invite the app already claimed by itself (any workspace-aware
    // request does that). Still shown as a Join card: joining is the choice.
    ...memberRows
      .filter((row) => {
        const workspace = workspaces.get(text(row.workspace_id));
        return workspace && text(workspace.owner_id) !== user.id;
      })
      .map((row) => ({
        workspaceId: text(row.workspace_id),
        teamName: text(workspaces.get(text(row.workspace_id))?.name) || 'A team',
        inviterName: inviterName(text(row.workspace_id)),
        role: roleOf(row.role),
        artistScoped: scoped.has(text(row.workspace_id)),
        joined: true,
        invitedAt: text(row.invited_at),
      })),
  ]
    .filter((invite) => invite.workspaceId && workspaces.has(invite.workspaceId))
    .sort((a, b) => b.invitedAt.localeCompare(a.invitedAt));

  const teams = await loadTeamSummaries(
    admin,
    memberRows
      .map((row) => ({ workspaceId: text(row.workspace_id), role: roleOf(row.role) }))
      .filter((row) => workspaces.has(row.workspaceId)),
    workspaces,
    user.id
  );

  let ownsWork = (ownReleases.count ?? 0) > 0;
  if (!ownsWork && ownWorkspace) {
    const records = await admin
      .from('next_records')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', text(ownWorkspace.id));
    ownsWork = (records.count ?? 0) > 0;
  }

  // The primary team, by the same rule lib/tasks-server.ts uses: your own,
  // unless you own no rollouts and joined someone else's.
  const joined = teams.filter((team) => !team.isOwn);
  const own = teams.find((team) => team.isOwn);
  const primaryWorkspaceId =
    (ownReleases.count ?? 0) === 0 && joined.length ? joined[0].workspaceId : own?.workspaceId ?? joined[0]?.workspaceId ?? null;

  return {
    approved,
    completed: profile.onboarding_completed === true,
    ownsWork,
    teamDecided: Boolean(text(profile.onboarding_persona)) && Boolean(ownWorkspace),
    ownTeam: ownWorkspace ? { workspaceId: text(ownWorkspace.id), name: text(ownWorkspace.name) } : null,
    invites,
    teams,
    primaryWorkspaceId,
  };
}

async function loadTeamSummaries(
  admin: SupabaseClient,
  memberships: Array<{ workspaceId: string; role: TeamRole }>,
  workspaces: Map<string, Row>,
  userId: string
): Promise<TeamSummary[]> {
  return Promise.all(
    memberships.map(async ({ workspaceId, role }) => {
      const workspace = workspaces.get(workspaceId) as Row;
      const ownerId = text(workspace.owner_id);
      const [artists, rollouts] = await Promise.all([
        admin.from(ARTISTS_TABLE).select('id,name').eq('workspace_id', workspaceId).order('created_at').limit(20),
        admin
          .from('releases')
          .select('id,title,artist_name,release_type,release_date', { count: 'exact' })
          .eq('owner_user_id', ownerId)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(ROLLOUTS_SHOWN),
      ]);
      return {
        workspaceId,
        name: text(workspace.name),
        role,
        isOwn: ownerId === userId,
        canAdd: role !== 'guest',
        artists: ((artists.data ?? []) as Row[]).map((row) => ({ id: text(row.id), name: text(row.name) })),
        rolloutCount: rollouts.count ?? 0,
        rollouts: ((rollouts.data ?? []) as Row[]).map((row) => ({
          id: text(row.id),
          title: text(row.title),
          artistName: text(row.artist_name),
          releaseType: text(row.release_type),
          releaseDate: row.release_date ? text(row.release_date).slice(0, 10) : null,
        })),
      };
    })
  );
}

// ── Name your team ───────────────────────────────────────────────────────────

/**
 * `whoFor: null` is the team made for a new account straight after sign-up
 * (#1412, 27 Nov 2026): no team screen, the name is "{First name}'s Team", and
 * nothing is written to the profile, so the persona stays empty and Home asks
 * "Who are you?" once (lib/persona-ask.ts). It is safe to run again: an account
 * that reloads before adding anything comes back through it, and a name
 * somebody chose is never replaced.
 */
export async function createOnboardingTeam(
  admin: SupabaseClient,
  user: User,
  input: { name: string; whoFor: TeamWhoFor | null; displayName: string }
): Promise<ServerResult<{ workspaceId: string; name: string }>> {
  const name = resolveTeamName(input.whoFor ? input.name : '', input.displayName);
  if (name.length > MAX_TEAM_NAME_LENGTH) return fail(400, 'Keep it under 80 characters.');

  // One team per owner (unique on owner_id): this finds it or makes it, and
  // the trial clock starts here, as it always has.
  const workspace = await ensureOwnedWorkspace(admin, user);

  if (!input.whoFor) {
    // The automatic name only goes on a team nobody has named: a new one, or
    // one another request made a moment ago with the system name. Any other
    // name is one somebody chose (on the old team screen, in Team settings, or
    // from an older account's organization), and it stays. Already carrying
    // the automatic name (a reload) means there is nothing to write.
    const current = text(workspace.name);
    if (current && !isSystemTeamName(current, user.email)) {
      return { ok: true, value: { workspaceId: workspace.id, name: current } };
    }
  }

  const renamed = await admin
    .from(WORKSPACES)
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', workspace.id)
    .eq('owner_id', user.id);
  if (renamed.error) return fail(500, 'Could not name your team.');
  if (!input.whoFor) return { ok: true, value: { workspaceId: workspace.id, name } };

  const persona = personaForWhoFor(input.whoFor);
  const profile = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const updates: Record<string, unknown> = {
    onboarding_persona: persona,
    onboarding_role: deriveOnboardingRoleFromPersona(persona),
    onboarding_step: 2,
    updated_at: new Date().toISOString(),
  };
  // Never over a role an invite gave (see nextProfileRoleForPersona).
  const nextRole = nextProfileRoleForPersona(text((profile.data as Row | null)?.role), persona);
  if (nextRole) updates.role = nextRole;
  const saved = await admin.from('profiles').update(updates).eq('id', user.id);
  if (saved.error) return fail(500, 'Could not save who the team is for.');

  return { ok: true, value: { workspaceId: workspace.id, name } };
}

// ── Join ─────────────────────────────────────────────────────────────────────

async function markOnboardingDone(admin: SupabaseClient, userId: string): Promise<void> {
  await admin
    .from('profiles')
    .update({ onboarding_completed: true, onboarding_completed_at: new Date().toISOString(), onboarding_step: 3 })
    .eq('id', userId)
    .eq('onboarding_completed', false);
}

async function membershipRole(admin: SupabaseClient, userId: string, workspaceId: string): Promise<TeamRole | null> {
  const { data } = await admin
    .from(MEMBERS)
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  return data ? roleOf((data as Row).role) : null;
}

/** Join the team an invite to this email is waiting in. One tap. */
export async function joinInvitedTeam(
  admin: SupabaseClient,
  user: User,
  workspaceId: string
): Promise<ServerResult<{ workspaceId: string; role: TeamRole }>> {
  const already = await membershipRole(admin, user.id, workspaceId);
  if (already) {
    await markOnboardingDone(admin, user.id);
    return { ok: true, value: { workspaceId, role: already } };
  }

  const email = emailOf(user);
  if (!email) return fail(404, 'This invite was not found.');
  const pending = await admin
    .from(MEMBERS)
    .select('id,invite_token,invite_expires_at')
    .eq('workspace_id', workspaceId)
    .ilike('email', escapeLike(email))
    .eq('status', 'invited')
    .is('user_id', null)
    .maybeSingle();
  if (pending.error || !pending.data) return fail(404, 'This invite was not found.');

  // An email-only invite carries no live token: mint one the way
  // /api/invites/resolve-by-email does, then join through the one claim
  // implementation every invite path shares.
  const row = pending.data as Row;
  let token = text(row.invite_token);
  const live = token && row.invite_expires_at && Date.parse(text(row.invite_expires_at)) > Date.now();
  if (!live) {
    token = randomUUID();
    const minted = await admin
      .from(MEMBERS)
      .update({
        invite_token: token,
        invite_expires_at: new Date(Date.now() + INVITE_TOKEN_TTL_MS).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', text(row.id));
    if (minted.error) return fail(500, 'Could not join the team.');
  }
  return claimToken(admin, user, token);
}

/** Join with a pasted invite link's token. */
export async function joinWithInviteToken(
  admin: SupabaseClient,
  user: User,
  token: string
): Promise<ServerResult<{ workspaceId: string; role: TeamRole }>> {
  return claimToken(admin, user, token);
}

async function claimToken(
  admin: SupabaseClient,
  user: User,
  token: string
): Promise<ServerResult<{ workspaceId: string; role: TeamRole }>> {
  const result = await claimWorkspaceInvite(admin, { token, userId: user.id, email: emailOf(user) });
  if (result.outcome === 'error') return fail(500, 'Could not join the team. Try again.');
  if (result.outcome === 'rejected') {
    if (result.reason === 'invalid') return fail(404, "That isn't an invite link. Ask for a new one.");
    if (result.reason === 'seat_limit') return fail(409, result.message);
    return fail(410, 'That link has run out. Ask the owner for a new one.');
  }
  if (result.outcome === 'joined') {
    await captureActivationIfReached(admin, { workspaceId: result.workspaceId, trigger: 'invite' });
  }
  const role = (await membershipRole(admin, user.id, result.workspaceId)) ?? 'member';
  await markOnboardingDone(admin, user.id);
  return { ok: true, value: { workspaceId: result.workspaceId, role } };
}

// ── Save unfinished music as a record in the making ──────────────────────────

export type OnboardingRecordInput = {
  workspaceId: string | null;
  artistId: string | null;
  artistName: string;
  title: string;
  kind: 'single' | 'ep' | 'album' | null;
  songTitle: string;
  songStage: 'idea' | 'recording' | 'mixing';
};

/** The team to add to: the one named (the caller must be in it and not a viewer), else their own. */
async function resolveWritableTeam(
  admin: SupabaseClient,
  user: User,
  workspaceId: string | null
): Promise<ServerResult<{ workspaceId: string; ownerId: string; artistScopeId: string | null }>> {
  if (!workspaceId) {
    const own = await ensureOwnedWorkspace(admin, user);
    return { ok: true, value: { workspaceId: own.id, ownerId: user.id, artistScopeId: null } };
  }
  const [membership, workspace] = await Promise.all([
    admin
      .from(MEMBERS)
      .select('id,role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
    admin.from(WORKSPACES).select('id,owner_id').eq('id', workspaceId).maybeSingle(),
  ]);
  if (!membership.data || !workspace.data) return fail(404, 'Team not found.');
  if ((membership.data as Row).role === 'guest') return fail(403, 'Your role on this team is view-only.');
  const ownerId = text((workspace.data as Row).owner_id);
  let artistScopeId: string | null = null;
  if (ownerId !== user.id) {
    const scope = await admin.from(MEMBERS).select('artist_scope_id').eq('id', text((membership.data as Row).id)).maybeSingle();
    artistScopeId = text((scope.data as Row | null)?.artist_scope_id) || null;
  }
  return { ok: true, value: { workspaceId, ownerId, artistScopeId } };
}

/** Finds the artist in the team (by id, else by name), or adds them within the plan's artist limit. */
async function resolveTeamArtist(
  admin: SupabaseClient,
  team: { workspaceId: string; ownerId: string },
  actorUserId: string,
  input: { artistId: string | null; artistName: string }
): Promise<ServerResult<{ id: string; name: string }>> {
  if (input.artistId) {
    const found = await admin
      .from(ARTISTS_TABLE)
      .select('id,name')
      .eq('id', input.artistId)
      .eq('workspace_id', team.workspaceId)
      .maybeSingle();
    if (found.data) return { ok: true, value: { id: text((found.data as Row).id), name: text((found.data as Row).name) } };
  }
  const name = input.artistName.trim().slice(0, 120);
  if (!name) return fail(400, 'Add the artist.');
  const slug = normalizeReleaseSlug(name) || `artist-${Date.now()}`;
  const existing = await admin
    .from(ARTISTS_TABLE)
    .select('id,name')
    .eq('workspace_id', team.workspaceId)
    .eq('slug', slug)
    .maybeSingle();
  if (existing.data) return { ok: true, value: { id: text((existing.data as Row).id), name: text((existing.data as Row).name) } };

  const allowance = await checkArtistAllowance(admin, team.workspaceId);
  if (!allowance.allowed) {
    await recordLimitHit(admin, {
      workspaceId: team.workspaceId,
      actorUserId,
      key: allowance.key,
      limit: allowance.limit,
      current: allowance.current,
    });
    return fail(409, `Your plan holds ${allowance.limit} ${allowance.limit === 1 ? 'artist' : 'artists'}. Pick one you already have.`, allowance.key);
  }
  const inserted = await admin
    .from(ARTISTS_TABLE)
    .insert({
      // Owned by the team's owner, like a rollout made in their team (#854).
      owner_user_id: team.ownerId,
      workspace_id: team.workspaceId,
      name,
      slug,
      updated_at: new Date().toISOString(),
    })
    .select('id,name')
    .single();
  if (inserted.error || !inserted.data) return fail(500, 'Could not add the artist.');
  return { ok: true, value: { id: text((inserted.data as Row).id), name: text((inserted.data as Row).name) } };
}

export async function createOnboardingRecord(
  admin: SupabaseClient,
  user: User,
  input: OnboardingRecordInput
): Promise<ServerResult<{ recordId: string; artistId: string; workspaceId: string }>> {
  const team = await resolveWritableTeam(admin, user, input.workspaceId);
  if (!team.ok) return team;
  // A teammate scoped to one artist adds music for that artist only. Checked
  // BEFORE the artist lookup, which would otherwise add a typed new artist to
  // the team and only then refuse.
  const scope = team.value.artistScopeId;
  if (scope && input.artistId && input.artistId !== scope) {
    return fail(403, 'You can only add music for your artist on this team.');
  }
  const artist = await resolveTeamArtist(
    admin,
    team.value,
    user.id,
    scope ? { artistId: scope, artistName: '' } : input
  );
  if (!artist.ok) return artist;

  const record = await createRecord(admin, {
    workspaceId: team.value.workspaceId,
    artistId: artist.value.id,
    userId: user.id,
    title: input.title,
    kind: input.kind,
    idea: '',
    // "Just an idea" starts the project at Idea; Recording and Mixing start it
    // in the making (2026-11-04, #1074). The first song keeps its own stage.
    status: input.songStage === 'idea' ? 'idea' : 'making',
    songStage: input.songStage,
  });
  if (!record.ok) return fail(record.status, record.error);
  // Best effort: the record exists either way, and the song can be added on its page.
  const song = await addSong(admin, team.value.workspaceId, record.value.id, {
    title: input.songTitle,
    stage: input.songStage,
  });
  if (!song.ok) console.error('[onboarding/music] record saved without its first song', song.error);

  await rememberOwnArtistName(admin, user.id, artist.value.name);

  return {
    ok: true,
    value: { recordId: record.value.id, artistId: artist.value.id, workspaceId: team.value.workspaceId },
  };
}

/**
 * "Just me, I'm the artist": the artist name they typed is theirs, so the app
 * does not ask for it again (ArtistNameGate). Used by the record path here and
 * by POST /api/releases for Ready to release and Already out (#854). Best
 * effort, never throws.
 */
export async function rememberOwnArtistName(
  admin: SupabaseClient,
  userId: string,
  artistName: string
): Promise<void> {
  const name = text(artistName);
  if (!name) return;
  try {
    const profile = await admin.from('profiles').select('role,artist_name').eq('id', userId).maybeSingle();
    const profileRow = (profile.data as Row | null) ?? {};
    if (text(profileRow.role) !== 'artist' || text(profileRow.artist_name)) return;
    await admin
      .from('profiles')
      .update({ artist_name: name, updated_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (error) {
    console.error('[onboarding] could not save the artist name to the profile', error);
  }
}
