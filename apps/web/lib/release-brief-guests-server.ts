import { randomUUID } from 'crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import {
  BRIEF_GUESTS_MAX,
  briefGuestJoinPath,
  briefGuestPagePath,
  isPlaceholderGuestEmail,
  placeholderGuestEmail,
  type BriefGuestInvite,
} from '@/lib/brief-guests';
import { formatBriefDay, lagosDay } from '@/lib/release-brief';
import { loadProfilesByIds, resolveAppBaseUrl, WORKSPACE_MEMBERS_TABLE } from '@/lib/tasks-server';

// Share the brief with a person (#897 phase 6, 2026-10-31). A brief guest is a
// workspace_members row with role 'guest', limited to one rollout
// (release_scope_ids), marked with brief_release_id so it takes no paid seat
// and counts toward the cap of 5 per rollout (Oyin, 31 Oct 2026).

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const INVITE_DAYS = 30;
const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export type BriefGuest = {
  id: string;
  name: string;
  /** Null when shared without one (sent over WhatsApp). */
  email: string | null;
  status: 'invited' | 'active';
  part: string[];
  /** The invite page, while they have not joined yet. */
  link: string | null;
};

/** The owner's team: the workspace a rollout's guests are added to. */
export async function workspaceIdForOwner(admin: SupabaseClient, ownerId: string): Promise<string | null> {
  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? text(asRow(data).id) || null : null;
}

/** The guests a rollout's brief was shared with, newest first. Never throws. */
export async function listBriefGuests(admin: SupabaseClient, releaseId: string): Promise<BriefGuest[]> {
  try {
    const { data } = await admin
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('id,user_id,email,status,invite_name,invite_token,brief_task_ids,invited_at')
      .eq('brief_release_id', releaseId)
      .neq('status', 'removed')
      .order('invited_at', { ascending: false });
    const rows = ((data || []) as unknown[]).map(asRow);
    if (rows.length === 0) return [];
    const taskIds = [...new Set(rows.flatMap((row) => (Array.isArray(row.brief_task_ids) ? row.brief_task_ids.map(String) : [])))];
    const [tasks, profiles] = await Promise.all([
      taskIds.length
        ? admin.from('tasks').select('id,title').in('id', taskIds).then((result) => (result.data || []) as unknown[])
        : Promise.resolve([] as unknown[]),
      loadProfilesByIds(admin, rows.map((row) => text(row.user_id)).filter(Boolean)),
    ]);
    const titleById = new Map(tasks.map(asRow).map((task) => [text(task.id), text(task.title)]));
    const base = resolveAppBaseUrl();
    return rows.map((row) => {
      const profile = profiles.get(text(row.user_id));
      const email = text(row.email);
      const token = text(row.invite_token);
      return {
        id: text(row.id),
        name: text(row.invite_name) || profile?.name || (isPlaceholderGuestEmail(email) ? 'Guest' : email),
        email: isPlaceholderGuestEmail(email) ? null : email,
        status: row.status === 'active' ? 'active' : 'invited',
        part: (Array.isArray(row.brief_task_ids) ? row.brief_task_ids.map(String) : [])
          .map((id) => titleById.get(id) ?? '')
          .filter(Boolean),
        link: row.status === 'invited' && token ? `${base}${briefGuestPagePath(token)}` : null,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Share the brief with a person: one guest row, limited to this rollout, with
 * their part saved to be assigned when they join. Emails the link when there
 * is an email; the sharer can always copy it or send it on WhatsApp.
 */
export async function inviteBriefGuest(
  admin: SupabaseClient,
  input: {
    releaseId: string;
    releaseOwnerId: string;
    releaseTitle: string;
    invite: BriefGuestInvite;
    inviter: User;
    inviterName: string;
  }
): Promise<Result<{ guest: BriefGuest; emailSent: boolean }>> {
  const workspaceId = await workspaceIdForOwner(admin, input.releaseOwnerId);
  if (!workspaceId) return { ok: false, status: 404, error: 'Team not found.' };

  const { count, error: countError } = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('brief_release_id', input.releaseId)
    .neq('status', 'removed');
  if (countError) return { ok: false, status: 500, error: 'Could not check the guests. Try again.' };
  if ((count ?? 0) >= BRIEF_GUESTS_MAX) {
    return { ok: false, status: 409, error: `A rollout can have ${BRIEF_GUESTS_MAX} guests. Remove one to add another.` };
  }

  if (input.invite.email) {
    const { data: existing } = await admin
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('id,status')
      .eq('workspace_id', workspaceId)
      .eq('email', input.invite.email)
      .neq('status', 'removed')
      .maybeSingle();
    if (existing) return { ok: false, status: 409, error: 'That email is already on your team.' };
  }

  // Their part: only this rollout's own activities.
  let taskIds: string[] = [];
  if (input.invite.taskIds.length) {
    const { data } = await admin.from('tasks').select('id').eq('release_id', input.releaseId).in('id', input.invite.taskIds);
    taskIds = ((data || []) as unknown[]).map((row) => text(asRow(row).id)).filter(Boolean);
  }

  const id = randomUUID();
  const token = randomUUID();
  const now = new Date();
  const { error } = await admin.from(WORKSPACE_MEMBERS_TABLE).insert({
    id,
    workspace_id: workspaceId,
    user_id: null,
    email: input.invite.email ?? placeholderGuestEmail(id),
    role: 'guest',
    status: 'invited',
    invite_token: token,
    invite_expires_at: new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    invited_at: now.toISOString(),
    joined_at: null,
    updated_at: now.toISOString(),
    release_scope_ids: [input.releaseId],
    brief_release_id: input.releaseId,
    brief_task_ids: taskIds,
    invite_name: input.invite.name,
  });
  if (error) return { ok: false, status: 500, error: 'Could not share the brief. Try again.' };

  const link = `${resolveAppBaseUrl()}${briefGuestPagePath(token)}`;
  let emailSent = false;
  if (input.invite.email && isEmailConfigured()) {
    const sent = await sendEmail(admin, {
      templateId: 'workspace_invite',
      to: input.invite.email,
      props: {
        workspaceName: input.releaseTitle,
        inviterLabel: input.inviterName,
        inviteUrl: link,
        accessLabel: 'the brief and your part',
      },
      trigger: 'brief_guest_invited',
      actorUserId: input.inviter.id,
    });
    emailSent = sent.ok;
  }
  console.info(`[brief-guest] ${input.invite.email ?? 'no email'} -> ${link} (emailed: ${emailSent})`);

  return {
    ok: true,
    value: {
      guest: {
        id,
        name: input.invite.name,
        email: input.invite.email,
        status: 'invited',
        part: [],
        link,
      },
      emailSent,
    },
  };
}

/** Take a guest off the rollout. Their activities stay in the plan, unassigned. */
export async function removeBriefGuest(
  admin: SupabaseClient,
  input: { releaseId: string; memberId: string }
): Promise<Result<{ id: string }>> {
  const { data, error } = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,user_id,brief_release_id')
    .eq('id', input.memberId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: 'Could not remove the guest.' };
  const row = data ? asRow(data) : null;
  if (!row || text(row.brief_release_id) !== input.releaseId) return { ok: false, status: 404, error: 'Not found.' };
  const { error: removeError } = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .update({ status: 'removed', invite_token: null, invite_expires_at: null, updated_at: new Date().toISOString() })
    .eq('id', input.memberId);
  if (removeError) return { ok: false, status: 500, error: 'Could not remove the guest.' };
  const userId = text(row.user_id);
  if (userId) {
    await admin.from('tasks').update({ assigned_to_user_id: null }).eq('release_id', input.releaseId).eq('assigned_to_user_id', userId);
  }
  return { ok: true, value: { id: input.memberId } };
}

/**
 * After a brief guest joins (called from the invite claim): their part is
 * assigned to them, and a placeholder email becomes theirs. Best effort.
 */
export async function finishBriefGuestJoin(
  admin: SupabaseClient,
  input: { memberId: string; userId: string; email: string }
): Promise<void> {
  try {
    const { data } = await admin
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('email,brief_release_id,brief_task_ids')
      .eq('id', input.memberId)
      .maybeSingle();
    const row = data ? asRow(data) : null;
    const releaseId = row ? text(row.brief_release_id) : '';
    if (!row || !releaseId) return;
    const taskIds = Array.isArray(row.brief_task_ids) ? row.brief_task_ids.map(String) : [];
    if (taskIds.length) {
      await admin.from('tasks').update({ assigned_to_user_id: input.userId }).eq('release_id', releaseId).in('id', taskIds);
    }
    if (isPlaceholderGuestEmail(text(row.email)) && input.email) {
      await admin.from(WORKSPACE_MEMBERS_TABLE).update({ email: input.email }).eq('id', input.memberId);
    }
  } catch {
    // Joining already worked; their part can be assigned by hand in the plan.
  }
}

export type BriefGuestPage = {
  releaseId: string;
  sharedBy: string;
  title: string;
  artistName: string;
  releaseDate: string | null;
  coverUrl: string | null;
  headline: string;
  idea: string;
  palette: string[];
  part: { id: string; title: string; spec: string; due: string; daysLeft: number | null }[];
  joinPath: string;
};

/**
 * What the invite page shows before joining: the brief and their part. Null
 * for a link that is wrong, used, removed or expired.
 */
export async function loadBriefGuestPage(
  admin: SupabaseClient,
  token: string,
  signCover: (artworkAssetId: string | null, releaseId: string) => Promise<string | null>
): Promise<BriefGuestPage | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,status,invite_expires_at,brief_release_id,brief_task_ids')
    .eq('invite_token', token)
    .maybeSingle();
  const member = data ? asRow(data) : null;
  const releaseId = member ? text(member.brief_release_id) : '';
  if (!member || !releaseId || member.status !== 'invited') return null;
  if (member.invite_expires_at && new Date(text(member.invite_expires_at)).getTime() < Date.now()) return null;

  const taskIds = Array.isArray(member.brief_task_ids) ? member.brief_task_ids.map(String) : [];
  const [releaseResult, briefResult, tasksResult] = await Promise.all([
    admin
      .from('releases')
      .select('id,title,artist_name,release_date,owner_user_id,artwork_asset_id,archived_at,deleted_at')
      .eq('id', releaseId)
      .maybeSingle(),
    admin.from('release_briefs').select('idea,headline,palette').eq('release_id', releaseId).maybeSingle(),
    taskIds.length
      ? admin.from('tasks').select('id,title,description,due_date,status').in('id', taskIds).eq('release_id', releaseId)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const release = releaseResult.data ? asRow(releaseResult.data) : null;
  if (!release || release.archived_at || release.deleted_at) return null;
  const brief = briefResult.data ? asRow(briefResult.data) : {};
  const owner = (await loadProfilesByIds(admin, [text(release.owner_user_id)])).get(text(release.owner_user_id));
  const today = lagosDay(new Date().toISOString()) as string;

  return {
    releaseId,
    sharedBy: (owner?.name || '').split(' ')[0] || 'Your team',
    title: text(release.title) || 'Untitled',
    artistName: text(release.artist_name),
    releaseDate: lagosDay(text(release.release_date) || null),
    coverUrl: await signCover(text(release.artwork_asset_id) || null, releaseId).catch(() => null),
    headline: text(brief.headline),
    idea: text(brief.idea),
    palette: Array.isArray(brief.palette) ? brief.palette.map(String) : [],
    part: ((tasksResult.data || []) as unknown[])
      .map(asRow)
      .filter((task) => task.status !== 'cancelled')
      .map((task) => {
        const due = lagosDay(text(task.due_date) || null);
        return {
          id: text(task.id),
          title: text(task.title),
          spec: text(task.description).split('\n')[0].trim(),
          due: due ? formatBriefDay(due) : '',
          daysLeft: due ? Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000) : null,
        };
      }),
    joinPath: briefGuestJoinPath(token, releaseId),
  };
}
