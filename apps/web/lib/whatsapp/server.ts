// WhatsApp chasing (SERVER-ONLY). Service-role client throughout, so THIS file
// and the routes that call it are the access control; the tables have RLS on
// with no policies.
//
// Four jobs:
//   settings   one row per team (switch, when to chase, who answers replies)
//   contacts   a person's number, and whether they said YES
//   the sweep  once a day, chase owners of tasks that are due or late
//   replies    read what they send back and act on it
//
// Nothing is ever sent to a number that has not replied YES, and a chase is one
// per task, kind and day: the claim is a unique index, taken before the send.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAiConfigured } from '@/lib/ai/provider';
import { legacyModelFor } from '@/lib/ai/model-router';
import { generateRoutedPlainText } from '@/lib/ai/routed';
import { recordRequestUsage } from '@/lib/ai/usage-log-server';
import { createUsageCollector } from '@/lib/credits/embedded';
import { dropRowsOfDeletedReleases } from '@/lib/rollout-trash-server';
import { sendPushToUsers } from '@/lib/push-server';
import { loadProfilesByIds, logTaskActivity } from '@/lib/tasks-server';
import { callOwnModel, isByoProvider, type ByoProvider } from './byo-ai';
import {
  addDays,
  chaseKindFor,
  formatDayShort,
  isQuietHour,
  lagosDay,
  type ChaseKind,
  type ChaseSettings,
} from './chase-rules';
import { normalizePhone, stripWhatsappPrefix } from './phone';
import { parseReply, type ReplyIntent } from './reply-intent';
import { decryptSecret } from './secret';
import { isWhatsappConfigured, sendWhatsapp } from './transport';
import { logUrgansAction } from '@/lib/urgans-action-log-server';
import { buildPostNudgeText, isPostPlatform, nextDayWords, nextPlannedPost, type ArtistPost } from '@/lib/posting-plan';
import { ARTIST_POSTS_TABLE, setPostStatusAsOwner, toArtistPost } from '@/lib/posting-plan-server';

const SETTINGS_TABLE = 'whatsapp_settings';
const CONTACTS_TABLE = 'whatsapp_contacts';
const MESSAGES_TABLE = 'whatsapp_messages';

// ---- settings --------------------------------------------------------------

export type WhatsappSettings = {
  enabled: boolean;
  chaseDayBefore: boolean;
  chaseDueDay: boolean;
  chaseOverdue: boolean;
  overdueEveryDays: number;
  tellOwnerOnDelay: boolean;
  /** Posting plan (2026-10-27): nudge the person posting on the day. */
  remindPosts: boolean;
  aiMode: 'urganize' | 'own';
  aiProvider: ByoProvider | null;
  aiBaseUrl: string | null;
  aiModel: string | null;
  /** Whether a key is stored. The key itself never leaves the server. */
  hasKey: boolean;
};

type SettingsRow = {
  workspace_id: string;
  enabled: boolean | null;
  chase_day_before: boolean | null;
  chase_due_day: boolean | null;
  chase_overdue: boolean | null;
  overdue_every_days: number | null;
  tell_owner_on_delay: boolean | null;
  remind_posts?: boolean | null;
  ai_mode: string | null;
  ai_provider: string | null;
  ai_base_url: string | null;
  ai_model: string | null;
  ai_key_encrypted: string | null;
};

export const DEFAULT_SETTINGS: WhatsappSettings = {
  enabled: false,
  chaseDayBefore: true,
  chaseDueDay: true,
  chaseOverdue: true,
  overdueEveryDays: 2,
  tellOwnerOnDelay: true,
  remindPosts: true,
  aiMode: 'urganize',
  aiProvider: null,
  aiBaseUrl: null,
  aiModel: null,
  hasKey: false,
};

function toSettings(row: SettingsRow | null): WhatsappSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    enabled: row.enabled === true,
    chaseDayBefore: row.chase_day_before !== false,
    chaseDueDay: row.chase_due_day !== false,
    chaseOverdue: row.chase_overdue !== false,
    overdueEveryDays: row.overdue_every_days ?? 2,
    tellOwnerOnDelay: row.tell_owner_on_delay !== false,
    remindPosts: row.remind_posts !== false,
    aiMode: row.ai_mode === 'own' ? 'own' : 'urganize',
    aiProvider: isByoProvider(row.ai_provider) ? row.ai_provider : null,
    aiBaseUrl: row.ai_base_url,
    aiModel: row.ai_model,
    hasKey: Boolean(row.ai_key_encrypted),
  };
}

export async function loadSettings(admin: SupabaseClient, workspaceId: string): Promise<WhatsappSettings> {
  const { data } = await admin.from(SETTINGS_TABLE).select('*').eq('workspace_id', workspaceId).maybeSingle();
  return toSettings((data as SettingsRow | null) ?? null);
}

export type SettingsPatch = Partial<{
  enabled: boolean;
  chaseDayBefore: boolean;
  chaseDueDay: boolean;
  chaseOverdue: boolean;
  overdueEveryDays: number;
  tellOwnerOnDelay: boolean;
  remindPosts: boolean;
  aiMode: 'urganize' | 'own';
  aiProvider: ByoProvider | null;
  aiBaseUrl: string | null;
  aiModel: string | null;
  /** Already encrypted by the route. null removes the stored key. */
  aiKeyEncrypted: string | null;
}>;

export async function saveSettings(
  admin: SupabaseClient,
  workspaceId: string,
  userId: string,
  patch: SettingsPatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row: Record<string, unknown> = { workspace_id: workspaceId, updated_by: userId };
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.chaseDayBefore !== undefined) row.chase_day_before = patch.chaseDayBefore;
  if (patch.chaseDueDay !== undefined) row.chase_due_day = patch.chaseDueDay;
  if (patch.chaseOverdue !== undefined) row.chase_overdue = patch.chaseOverdue;
  if (patch.overdueEveryDays !== undefined) row.overdue_every_days = patch.overdueEveryDays;
  if (patch.tellOwnerOnDelay !== undefined) row.tell_owner_on_delay = patch.tellOwnerOnDelay;
  if (patch.remindPosts !== undefined) row.remind_posts = patch.remindPosts;
  if (patch.aiMode !== undefined) row.ai_mode = patch.aiMode;
  if (patch.aiProvider !== undefined) row.ai_provider = patch.aiProvider;
  if (patch.aiBaseUrl !== undefined) row.ai_base_url = patch.aiBaseUrl;
  if (patch.aiModel !== undefined) row.ai_model = patch.aiModel;
  if (patch.aiKeyEncrypted !== undefined) row.ai_key_encrypted = patch.aiKeyEncrypted;

  const { error } = await admin.from(SETTINGS_TABLE).upsert(row, { onConflict: 'workspace_id' });
  if (error) {
    console.error('[whatsapp] saveSettings failed:', error.message);
    return { ok: false, error: 'Could not save. Try again.' };
  }
  return { ok: true };
}

/** The stored key, decrypted, for a call made on the team's behalf. */
async function loadOwnAiConfig(admin: SupabaseClient, workspaceId: string) {
  const { data } = await admin.from(SETTINGS_TABLE).select('*').eq('workspace_id', workspaceId).maybeSingle();
  const row = data as SettingsRow | null;
  if (!row || row.ai_mode !== 'own' || !isByoProvider(row.ai_provider) || !row.ai_model || !row.ai_key_encrypted) {
    return null;
  }
  const apiKey = decryptSecret(row.ai_key_encrypted);
  if (!apiKey) return null;
  return { provider: row.ai_provider, baseUrl: row.ai_base_url, model: row.ai_model, apiKey };
}

// ---- contacts --------------------------------------------------------------

export type ContactStatus = 'pending' | 'opted_in' | 'stopped';

export type WhatsappContact = {
  id: string;
  workspaceId: string;
  userId: string;
  phone: string;
  status: ContactStatus;
  lastTaskId: string | null;
  /** The post the last nudge was about, so Done or Skip has something to mean. */
  lastPostId: string | null;
  awaiting: 'date' | null;
};

type ContactRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  phone: string;
  status: ContactStatus;
  last_task_id: string | null;
  last_post_id?: string | null;
  awaiting: 'date' | null;
};

function toContact(row: ContactRow): WhatsappContact {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    phone: row.phone,
    status: row.status,
    lastTaskId: row.last_task_id,
    lastPostId: row.last_post_id ?? null,
    awaiting: row.awaiting,
  };
}

export async function listContacts(admin: SupabaseClient, workspaceId: string): Promise<WhatsappContact[]> {
  const { data } = await admin.from(CONTACTS_TABLE).select('*').eq('workspace_id', workspaceId);
  return ((data as ContactRow[] | null) ?? []).map(toContact);
}

async function logMessage(
  admin: SupabaseClient,
  input: {
    workspaceId: string | null;
    userId: string | null;
    taskId?: string | null;
    postId?: string | null;
    direction: 'in' | 'out';
    kind: string;
    body: string;
    providerMessageId?: string | null;
    status?: string;
    error?: string | null;
    chaseDay?: string | null;
  }
): Promise<{ id: string } | { conflict: true } | null> {
  const { data, error } = await admin
    .from(MESSAGES_TABLE)
    .insert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      task_id: input.taskId ?? null,
      post_id: input.postId ?? null,
      direction: input.direction,
      kind: input.kind,
      body: input.body,
      provider_message_id: input.providerMessageId ?? null,
      status: input.status ?? 'sent',
      error: input.error ?? null,
      chase_day: input.chaseDay ?? null,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { conflict: true };
    console.error('[whatsapp] logMessage failed:', error.message);
    return null;
  }
  return { id: (data as { id: string }).id };
}

function firstName(name: string | null | undefined): string {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

/** Adds or changes a person's number, then asks for their YES. */
export async function addContactAndInvite(
  admin: SupabaseClient,
  input: { workspaceId: string; userId: string; phoneRaw: string; inviterName: string }
): Promise<{ ok: true; contact: WhatsappContact; sent: boolean; warning?: string } | { ok: false; error: string }> {
  const phone = normalizePhone(input.phoneRaw);
  if (!phone) return { ok: false, error: 'That number does not look right. Add the country code, like +234.' };

  const { data: clash } = await admin.from(CONTACTS_TABLE).select('user_id').eq('phone', phone).maybeSingle();
  if (clash && (clash as { user_id: string }).user_id !== input.userId) {
    return { ok: false, error: 'That number is already used by another person.' };
  }

  const { data: existing } = await admin.from(CONTACTS_TABLE).select('*').eq('user_id', input.userId).maybeSingle();
  const prior = existing as ContactRow | null;
  const sameNumber = prior?.phone === phone;

  // A changed number is a new person as far as consent goes: back to pending.
  // The same number that already said YES keeps its YES.
  const keepStatus = sameNumber ? prior!.status : 'pending';
  const { data: saved, error } = await admin
    .from(CONTACTS_TABLE)
    .upsert(
      {
        workspace_id: input.workspaceId,
        user_id: input.userId,
        phone,
        status: keepStatus,
        awaiting: null,
        ...(keepStatus === 'pending' ? { opted_in_at: null, stopped_at: null } : {}),
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();
  if (error || !saved) {
    console.error('[whatsapp] addContact failed:', error?.message);
    return { ok: false, error: 'Could not save that number. Try again.' };
  }
  const contact = toContact(saved as ContactRow);
  if (contact.status === 'opted_in') return { ok: true, contact, sent: false };

  const profiles = await loadProfilesByIds(admin, [input.userId]);
  const name = firstName(profiles.get(input.userId)?.name);
  const sent = await sendOptIn(admin, contact, name, input.inviterName);
  if (!sent.ok) {
    return { ok: true, contact, sent: false, warning: `Saved, but the message did not send: ${sent.error}` };
  }
  return { ok: true, contact, sent: true };
}

async function sendOptIn(
  admin: SupabaseClient,
  contact: WhatsappContact,
  name: string,
  inviterName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = `Hi ${name}, ${inviterName} added you to a team on Urganize. I'll message you here about tasks that are yours. Reply YES to allow it, or STOP any time.`;
  const result = await sendWhatsapp({
    to: contact.phone,
    body,
    contentSid: process.env.WHATSAPP_OPTIN_CONTENT_SID?.trim() || null,
    contentVariables: { '1': name, '2': inviterName },
  });
  await logMessage(admin, {
    workspaceId: contact.workspaceId,
    userId: contact.userId,
    direction: 'out',
    kind: 'opt_in',
    body,
    providerMessageId: result.ok ? result.sid : null,
    status: result.ok ? 'sent' : 'failed',
    error: result.ok ? null : result.error,
  });
  if (result.ok) {
    await admin.from(CONTACTS_TABLE).update({ opt_in_sent_at: new Date().toISOString() }).eq('id', contact.id);
    return { ok: true };
  }
  return { ok: false, error: result.error };
}

export async function removeContact(admin: SupabaseClient, workspaceId: string, userId: string) {
  await admin.from(CONTACTS_TABLE).delete().eq('workspace_id', workspaceId).eq('user_id', userId);
}

// ---- the daily sweep -------------------------------------------------------

type TaskRow = {
  id: string;
  title: string | null;
  due_date: string | null;
  status: string;
  release_id: string | null;
  assigned_to_user_id: string | null;
};

const CHASEABLE_STATUSES = ['todo', 'in_progress', 'in_review'];

function dueWords(kind: ChaseKind, dueDay: string): string {
  const short = formatDayShort(dueDay);
  if (kind === 'day_before') return `tomorrow, ${short}`;
  if (kind === 'due_day') return `today, ${short}`;
  return `${short}, and is now late`;
}

export function buildChaseText(name: string, taskTitle: string, releaseTitle: string | null, kind: ChaseKind, dueDay: string): string {
  const where = releaseTitle ? ` for ${releaseTitle}` : '';
  return `Hi ${name}. "${taskTitle}"${where} is due ${dueWords(kind, dueDay)}. Is it done? Reply Done, Need more time, or Not mine.`;
}

export type ChaseSweepResult =
  | { skipped: 'not_configured' | 'quiet_hours' | 'no_teams' }
  | { sent: number; failed: number; skippedAlreadyChased: number };

/**
 * One chase per person per day, for their most urgent task. Rides the daily
 * cron. Never throws, so a failure here cannot take the sweeps around it down.
 */
export async function runWhatsappChaseSweep(admin: SupabaseClient, now: Date = new Date()): Promise<ChaseSweepResult> {
  try {
    if (!isWhatsappConfigured()) return { skipped: 'not_configured' };
    if (isQuietHour(now)) return { skipped: 'quiet_hours' };

    const { data: teamRows } = await admin.from(SETTINGS_TABLE).select('*').eq('enabled', true);
    const teams = (teamRows as SettingsRow[] | null) ?? [];
    if (!teams.length) return { skipped: 'no_teams' };

    const today = lagosDay(now);
    let sent = 0;
    let failed = 0;
    let skippedAlreadyChased = 0;

    for (const teamRow of teams) {
      const settings = toSettings(teamRow);
      const rules: ChaseSettings = {
        chaseDayBefore: settings.chaseDayBefore,
        chaseDueDay: settings.chaseDueDay,
        chaseOverdue: settings.chaseOverdue,
        overdueEveryDays: settings.overdueEveryDays,
      };

      const { data: contactRows } = await admin
        .from(CONTACTS_TABLE)
        .select('*')
        .eq('workspace_id', teamRow.workspace_id)
        .eq('status', 'opted_in');
      const contacts = ((contactRows as ContactRow[] | null) ?? []).map(toContact);

      for (const contact of contacts) {
        let outcome = await chaseOneContact(admin, contact, rules, today, now);
        // Tasks first. A day with no task to chase can carry today's post.
        if (outcome === 'none' && settings.remindPosts) outcome = await nudgeOnePost(admin, contact, today);
        if (outcome === 'sent') sent += 1;
        else if (outcome === 'failed') failed += 1;
        else if (outcome === 'already') skippedAlreadyChased += 1;
      }
    }
    return { sent, failed, skippedAlreadyChased };
  } catch (error) {
    console.error('[whatsapp] chase sweep failed:', error);
    return { sent: 0, failed: -1, skippedAlreadyChased: 0 };
  }
}

async function chaseOneContact(
  admin: SupabaseClient,
  contact: WhatsappContact,
  rules: ChaseSettings,
  today: string,
  now: Date
): Promise<'sent' | 'failed' | 'already' | 'none'> {
  // One chase per person per day, whatever the kind or task.
  const { count } = await admin
    .from(MESSAGES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', contact.userId)
    .eq('chase_day', today);
  if ((count ?? 0) > 0) return 'already';

  const { data: taskData } = await admin
    .from('tasks')
    .select('id,title,due_date,status,release_id,assigned_to_user_id')
    .eq('workspace_id', contact.workspaceId)
    .eq('assigned_to_user_id', contact.userId)
    .in('status', CHASEABLE_STATUSES)
    .not('due_date', 'is', null);
  const live = await dropRowsOfDeletedReleases(admin, (taskData as TaskRow[] | null) ?? [], (t) => t.release_id);
  if (!live.length) return 'none';

  const { data: lastOverdue } = await admin
    .from(MESSAGES_TABLE)
    .select('task_id,chase_day')
    .eq('user_id', contact.userId)
    .eq('kind', 'overdue')
    .in('task_id', live.map((t) => t.id))
    .order('chase_day', { ascending: false });
  const lastOverdueByTask = new Map<string, string>();
  for (const row of (lastOverdue as Array<{ task_id: string; chase_day: string }> | null) ?? []) {
    if (!lastOverdueByTask.has(row.task_id)) lastOverdueByTask.set(row.task_id, row.chase_day);
  }

  const candidates = live
    .map((task) => ({
      task,
      kind: chaseKindFor({
        dueDate: task.due_date,
        now,
        settings: rules,
        lastOverdueChaseDay: lastOverdueByTask.get(task.id) ?? null,
      }),
    }))
    .filter((c): c is { task: TaskRow; kind: ChaseKind } => c.kind !== null)
    .sort((a, b) => Date.parse(a.task.due_date ?? '') - Date.parse(b.task.due_date ?? ''));
  const pick = candidates[0];
  if (!pick) return 'none';

  const [profiles, releaseRow] = await Promise.all([
    loadProfilesByIds(admin, [contact.userId]),
    pick.task.release_id
      ? admin.from('releases').select('title').eq('id', pick.task.release_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const name = firstName(profiles.get(contact.userId)?.name);
  const releaseTitle = ((releaseRow.data as { title?: string } | null)?.title || '').trim() || null;
  const title = (pick.task.title || 'Your task').trim();
  const dueDay = lagosDay(new Date(pick.task.due_date as string));
  const text = buildChaseText(name, title, releaseTitle, pick.kind, dueDay);

  // Claim first. If another run took today's slot the insert conflicts and we stop.
  const claim = await logMessage(admin, {
    workspaceId: contact.workspaceId,
    userId: contact.userId,
    taskId: pick.task.id,
    direction: 'out',
    kind: pick.kind,
    body: text,
    status: 'sending',
    chaseDay: today,
  });
  if (!claim) return 'failed';
  if ('conflict' in claim) return 'already';

  const result = await sendWhatsapp({
    to: contact.phone,
    body: text,
    contentSid: process.env.WHATSAPP_CHASE_CONTENT_SID?.trim() || null,
    contentVariables: { '1': name, '2': releaseTitle ? `${title} for ${releaseTitle}` : title, '3': dueWords(pick.kind, dueDay) },
  });
  await admin
    .from(MESSAGES_TABLE)
    .update({
      status: result.ok ? 'sent' : 'failed',
      provider_message_id: result.ok ? result.sid : null,
      error: result.ok ? null : result.error,
    })
    .eq('id', claim.id);
  await logUrgansAction(admin, {
    source: 'cron',
    trigger: 'daily_sweep',
    tool: 'whatsapp.chase',
    level: 'auto',
    actorUserId: contact.userId,
    workspaceId: contact.workspaceId,
    releaseId: pick.task.release_id,
    objectType: 'task',
    objectId: pick.task.id,
    args: { kind: pick.kind },
    after: { message: text },
    ok: result.ok,
    summary: `Chased ${name} about "${title}" on WhatsApp`,
    error: result.ok ? null : result.error,
  });
  if (!result.ok) return 'failed';

  await admin.from(CONTACTS_TABLE).update({ last_task_id: pick.task.id, last_post_id: null, awaiting: null }).eq('id', contact.id);
  return 'sent';
}

// ---- posting plan nudges (2026-10-27) ---------------------------------------

/**
 * "Post the studio clip today?" for a person's first planned post of the day.
 * Same slot as a task chase: one message per person per day, claimed first.
 */
async function nudgeOnePost(
  admin: SupabaseClient,
  contact: WhatsappContact,
  today: string
): Promise<'sent' | 'failed' | 'already' | 'none'> {
  const { data: postRows } = await admin
    .from(ARTIST_POSTS_TABLE)
    .select('id,artist_id,release_id,post_day,what,platform,owner_user_id,status,done_at')
    .eq('workspace_id', contact.workspaceId)
    .eq('owner_user_id', contact.userId)
    .eq('post_day', today)
    .eq('status', 'planned')
    .order('created_at', { ascending: true })
    .limit(1);
  const row = ((postRows as Parameters<typeof toArtistPost>[0][] | null) ?? [])[0];
  if (!row) return 'none';
  const post = toArtistPost(row);

  const [profiles, artistRow] = await Promise.all([
    loadProfilesByIds(admin, [contact.userId]),
    admin.from('artists').select('name').eq('id', post.artistId).maybeSingle(),
  ]);
  const name = firstName(profiles.get(contact.userId)?.name);
  const artistName = ((artistRow.data as { name?: string } | null)?.name || '').trim() || 'your artist';
  const text = buildPostNudgeText(name, post.what, artistName, post.platform);

  const claim = await logMessage(admin, {
    workspaceId: contact.workspaceId,
    userId: contact.userId,
    postId: post.id,
    direction: 'out',
    kind: 'post_day',
    body: text,
    status: 'sending',
    chaseDay: today,
  });
  if (!claim) return 'failed';
  if ('conflict' in claim) return 'already';

  const where = isPostPlatform(post.platform) && post.platform !== 'other' ? ` on ${post.platform}` : '';
  const result = await sendWhatsapp({
    to: contact.phone,
    body: text,
    contentSid: process.env.WHATSAPP_POST_CONTENT_SID?.trim() || null,
    contentVariables: { '1': name, '2': post.what, '3': `${artistName}${where}` },
  });
  await admin
    .from(MESSAGES_TABLE)
    .update({
      status: result.ok ? 'sent' : 'failed',
      provider_message_id: result.ok ? result.sid : null,
      error: result.ok ? null : result.error,
    })
    .eq('id', claim.id);
  if (!result.ok) return 'failed';

  await admin.from(CONTACTS_TABLE).update({ last_post_id: post.id, last_task_id: null, awaiting: null }).eq('id', contact.id);
  return 'sent';
}

/** Done or Skip on the post the last nudge was about. */
async function actOnPostReply(
  admin: SupabaseClient,
  contact: WhatsappContact,
  postId: string,
  status: 'done' | 'skipped',
  rawText: string,
  now: Date
) {
  const updated = await setPostStatusAsOwner(admin, postId, contact.userId, status);
  await logUrgansAction(admin, {
    source: 'whatsapp',
    trigger: 'whatsapp_reply',
    tool: status === 'done' ? 'whatsapp.post_done' : 'whatsapp.post_skip',
    level: 'auto',
    actorUserId: contact.userId,
    workspaceId: contact.workspaceId,
    releaseId: updated?.post.releaseId ?? null,
    objectType: 'artist_post',
    objectId: postId,
    args: { reply: rawText.slice(0, 200) },
    before: null,
    after: updated ? { status } : null,
    ok: Boolean(updated),
    summary: `${status === 'done' ? 'Marked' : 'Skipped'} "${updated?.post.what ?? 'a post'}" from a WhatsApp reply`,
    error: updated ? null : 'post not found or not theirs',
  });
  await admin.from(CONTACTS_TABLE).update({ last_post_id: null, awaiting: null }).eq('id', contact.id);
  if (!updated) {
    await replyTo(admin, contact, "I couldn't find that post. Please tick it in Urganize.");
    return;
  }

  // "Next for Tems: lyric snippet on Thursday."
  const today = lagosDay(now);
  const { data: ahead } = await admin
    .from(ARTIST_POSTS_TABLE)
    .select('id,artist_id,release_id,post_day,what,platform,owner_user_id,status,done_at')
    .eq('artist_id', updated.post.artistId)
    .eq('status', 'planned')
    .gt('post_day', today)
    .order('post_day', { ascending: true })
    .limit(5);
  const next: ArtistPost | null = nextPlannedPost(
    ((ahead as Parameters<typeof toArtistPost>[0][] | null) ?? []).map(toArtistPost),
    today
  );
  const { data: artistRow } = await admin.from('artists').select('name').eq('id', updated.post.artistId).maybeSingle();
  const artistName = ((artistRow as { name?: string } | null)?.name || '').trim();
  const nextLine = next && artistName ? ` Next for ${artistName}: ${next.what}, ${nextDayWords(next.postDay, today)}.` : '';
  await replyTo(admin, contact, `${status === 'done' ? 'Nice one. Marked done.' : 'Skipped.'}${nextLine}`);
}

// ---- replies ---------------------------------------------------------------

async function replyTo(admin: SupabaseClient, contact: WhatsappContact, body: string, taskId: string | null = null) {
  const result = await sendWhatsapp({ to: contact.phone, body });
  await logMessage(admin, {
    workspaceId: contact.workspaceId,
    userId: contact.userId,
    taskId,
    direction: 'out',
    kind: 'reply',
    body,
    providerMessageId: result.ok ? result.sid : null,
    status: result.ok ? 'sent' : 'failed',
    error: result.ok ? null : result.error,
  });
}

async function loadOwner(admin: SupabaseClient, workspaceId: string) {
  const { data } = await admin.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
  const ownerId = (data as { owner_id?: string } | null)?.owner_id ?? null;
  if (!ownerId) return { id: null, name: 'the team lead' };
  const profiles = await loadProfilesByIds(admin, [ownerId]);
  return { id: ownerId, name: firstName(profiles.get(ownerId)?.name) };
}

async function tellOwner(admin: SupabaseClient, ownerId: string | null, title: string, body: string) {
  if (!ownerId) return;
  await sendPushToUsers(admin, [ownerId], { title, body, url: '/dashboard', tag: `whatsapp-${Date.now()}` });
}

/** The task a reply is about, only if it still belongs to the person replying. */
async function loadTaskFor(admin: SupabaseClient, contact: WhatsappContact): Promise<TaskRow | null> {
  if (!contact.lastTaskId) return null;
  const { data } = await admin
    .from('tasks')
    .select('id,title,due_date,status,release_id,assigned_to_user_id')
    .eq('id', contact.lastTaskId)
    .eq('assigned_to_user_id', contact.userId)
    .maybeSingle();
  return (data as TaskRow | null) ?? null;
}

async function aiReply(admin: SupabaseClient, contact: WhatsappContact, task: TaskRow | null, text: string): Promise<string | null> {
  const context = task
    ? `The last task they were chased about: "${task.title}", due ${task.due_date ? formatDayShort(lagosDay(new Date(task.due_date))) : 'no date'}.`
    : 'They have not been chased about a task today.';
  const messages = [
    {
      role: 'system' as const,
      content:
        'You are the AI in Urganize, replying on WhatsApp for a music team that uses Urganize. Reply in one or two short sentences, plain words, no em dashes, no hype. ' +
        'You cannot change tasks yourself. If they want to mark something done, tell them to reply Done. If they need more time, tell them to reply Need more time. ' +
        'Never invent facts about the task. ' + context,
    },
    { role: 'user' as const, content: text.slice(0, 600) },
  ];

  const own = await loadOwnAiConfig(admin, contact.workspaceId);
  if (own) {
    const result = await callOwnModel(own, messages);
    if (result.ok) return result.text.slice(0, 500);
    console.warn('[whatsapp] own AI failed, falling back to Urganize AI:', result.error);
  }
  if (!isAiConfigured()) return null;
  // Our model, so it routes and its usage is logged, failed attempts too (a
  // failed call may still have been billed).
  const collector = createUsageCollector(legacyModelFor('whatsapp_reply') ?? null);
  let reply: string | null = null;
  try {
    const out = await generateRoutedPlainText({
      surface: 'whatsapp_reply',
      messages,
      timeoutMs: 20_000,
      maxRetries: 1,
      onUsage: collector.onUsage,
      onFailure: collector.onFailure,
    });
    reply = out.slice(0, 500);
  } catch {
    reply = null;
  }
  await recordRequestUsage(admin, {
    context: {
      requestId: `whatsapp_reply:${randomUUID()}`,
      feature: 'whatsapp_reply',
      workspaceId: contact.workspaceId,
      ownerUserId: null,
      actorUserId: contact.userId,
      releaseId: task?.release_id ?? null,
    },
    calls: collector.calls,
    failures: collector.failures,
    creditsCharged: 0,
  });
  return reply;
}

/** Tests the key a team typed, without storing it. */
export async function testOwnAi(config: { provider: ByoProvider; baseUrl: string | null; model: string; apiKey: string }) {
  return callOwnModel(config, [{ role: 'user', content: 'Reply with the word ok.' }], { maxTokens: 5, timeoutMs: 15_000 });
}

export type InboundInput = { from: string; body: string; providerMessageId: string | null };

/**
 * Handles one message from a person. Safe to call twice with the same
 * providerMessageId: the second call does nothing.
 */
export async function handleInboundWhatsapp(admin: SupabaseClient, input: InboundInput, now: Date = new Date()): Promise<void> {
  const phone = normalizePhone(stripWhatsappPrefix(input.from));
  if (!phone) return;
  const { data } = await admin.from(CONTACTS_TABLE).select('*').eq('phone', phone).maybeSingle();
  if (!data) return;
  const contact = toContact(data as ContactRow);

  const logged = await logMessage(admin, {
    workspaceId: contact.workspaceId,
    userId: contact.userId,
    taskId: contact.lastTaskId,
    direction: 'in',
    kind: 'reply',
    body: input.body.slice(0, 2000),
    providerMessageId: input.providerMessageId,
  });
  if (logged && 'conflict' in logged) return;

  await admin.from(CONTACTS_TABLE).update({ last_inbound_at: now.toISOString() }).eq('id', contact.id);

  const intent = parseReply(input.body, now, contact.awaiting === 'date');
  await actOnReply(admin, contact, intent, input.body, now);
}

async function actOnReply(admin: SupabaseClient, contact: WhatsappContact, intent: ReplyIntent, rawText: string, now: Date) {
  if (intent.type === 'stop') {
    await admin
      .from(CONTACTS_TABLE)
      .update({ status: 'stopped', stopped_at: now.toISOString(), awaiting: null })
      .eq('id', contact.id);
    await replyTo(admin, contact, "Done. I won't message you again. Reply YES any time to turn it back on.");
    return;
  }

  if (contact.status !== 'opted_in') {
    if (intent.type === 'yes') {
      await admin
        .from(CONTACTS_TABLE)
        .update({ status: 'opted_in', opted_in_at: now.toISOString(), stopped_at: null })
        .eq('id', contact.id);
      await replyTo(admin, contact, "Thanks. You'll hear from me only about your tasks and posts.");
    } else if (contact.status === 'pending') {
      await replyTo(admin, contact, 'Reply YES to let Urganize message you here, or STOP.');
    }
    return;
  }

  // A Done or Skip after a post nudge is about the post (posting plan, 2026-10-27).
  if (contact.lastPostId && (intent.type === 'done' || intent.type === 'skip')) {
    await actOnPostReply(admin, contact, contact.lastPostId, intent.type === 'done' ? 'done' : 'skipped', rawText, now);
    return;
  }

  const [task, owner, settings] = await Promise.all([
    loadTaskFor(admin, contact),
    loadOwner(admin, contact.workspaceId),
    loadSettings(admin, contact.workspaceId),
  ]);
  const profiles = await loadProfilesByIds(admin, [contact.userId]);
  const who = firstName(profiles.get(contact.userId)?.name);

  switch (intent.type) {
    case 'yes':
      await replyTo(admin, contact, "You're all set.");
      return;

    case 'done': {
      if (!task) {
        await replyTo(admin, contact, "Which task is done? I'll check when I next message you about one.");
        return;
      }
      const { error } = await admin
        .from('tasks')
        .update({ status: 'done', completed_at: now.toISOString() })
        .eq('id', task.id)
        .eq('assigned_to_user_id', contact.userId);
      await logUrgansAction(admin, {
        source: 'whatsapp',
        trigger: 'whatsapp_reply',
        tool: 'whatsapp.mark_done',
        level: 'auto',
        actorUserId: contact.userId,
        workspaceId: contact.workspaceId,
        releaseId: task.release_id,
        objectType: 'task',
        objectId: task.id,
        args: { reply: rawText.slice(0, 200) },
        before: { title: task.title, status: task.status },
        after: error ? null : { title: task.title, status: 'done', completed_at: now.toISOString() },
        ok: !error,
        summary: `Marked "${task.title ?? 'a task'}" done from a WhatsApp reply`,
        error: error?.message ?? null,
      });
      if (error) {
        console.error('[whatsapp] mark done failed:', error.message);
        await replyTo(admin, contact, "I couldn't mark that done. Please tick it in Urganize.", task.id);
        return;
      }
      await logTaskActivity(admin, {
        taskId: task.id,
        actorId: contact.userId,
        message: 'Marked done on WhatsApp',
        metadata: { kind: 'whatsapp_done' },
      });
      await admin.from(CONTACTS_TABLE).update({ awaiting: null }).eq('id', contact.id);
      await replyTo(admin, contact, `Marked done. Thank you, ${who}.`, task.id);
      return;
    }

    case 'need_time': {
      if (!task) {
        await replyTo(admin, contact, 'Which task is it? I will ask again next time I message you about one.');
        return;
      }
      if (intent.date) {
        await moveDueDate(admin, contact, task, intent.date, owner, settings.tellOwnerOnDelay, who);
        return;
      }
      await admin.from(CONTACTS_TABLE).update({ awaiting: 'date' }).eq('id', contact.id);
      await replyTo(admin, contact, 'Got it. What date works?', task.id);
      return;
    }

    case 'date': {
      if (!task) {
        await admin.from(CONTACTS_TABLE).update({ awaiting: null }).eq('id', contact.id);
        await replyTo(admin, contact, "I'm not sure which task that is for. I'll ask again next time.");
        return;
      }
      await moveDueDate(admin, contact, task, intent.date, owner, settings.tellOwnerOnDelay, who);
      return;
    }

    case 'not_mine': {
      await admin.from(CONTACTS_TABLE).update({ awaiting: null }).eq('id', contact.id);
      await tellOwner(
        admin,
        owner.id,
        'Task not theirs',
        `${who} says "${task?.title ?? 'a task'}" is not theirs. Reassign it?`
      );
      await replyTo(admin, contact, `Understood. I told ${owner.name} so they can reassign it.`, task?.id ?? null);
      return;
    }

    // Skip with no post nudge behind it is just words.
    case 'skip':
    case 'text': {
      const answer = await aiReply(admin, contact, task, rawText);
      if (answer) {
        await replyTo(admin, contact, answer, task?.id ?? null);
      } else {
        await tellOwner(admin, owner.id, `${who} replied on WhatsApp`, rawText.slice(0, 140));
        await replyTo(admin, contact, `I passed that on to ${owner.name}.`, task?.id ?? null);
      }
      return;
    }
  }
}

async function moveDueDate(
  admin: SupabaseClient,
  contact: WhatsappContact,
  task: TaskRow,
  day: string,
  owner: { id: string | null; name: string },
  tellOwnerOnDelay: boolean,
  who: string
) {
  // A new date has to be ahead of today, or the next chase would fire at once.
  const today = lagosDay(new Date());
  const chosen = day < today ? addDays(today, 1) : day;
  const { error } = await admin
    .from('tasks')
    .update({ due_date: `${chosen}T11:00:00Z` })
    .eq('id', task.id)
    .eq('assigned_to_user_id', contact.userId);
  await logUrgansAction(admin, {
    source: 'whatsapp',
    trigger: 'whatsapp_reply',
    tool: 'whatsapp.move_due_date',
    level: 'auto',
    actorUserId: contact.userId,
    workspaceId: contact.workspaceId,
    releaseId: task.release_id,
    objectType: 'task',
    objectId: task.id,
    args: { askedFor: day },
    before: { title: task.title, due_date: task.due_date },
    after: error ? null : { title: task.title, due_date: `${chosen}T11:00:00Z` },
    ok: !error,
    summary: `Moved "${task.title ?? 'a task'}" to ${chosen} from a WhatsApp reply`,
    error: error?.message ?? null,
  });
  if (error) {
    console.error('[whatsapp] move due date failed:', error.message);
    await replyTo(admin, contact, "I couldn't change the date. Please change it in Urganize.", task.id);
    return;
  }
  await logTaskActivity(admin, {
    taskId: task.id,
    actorId: contact.userId,
    message: `Moved the due date to ${formatDayShort(chosen)} on WhatsApp`,
    metadata: { kind: 'whatsapp_date', date: chosen },
  });
  await admin.from(CONTACTS_TABLE).update({ awaiting: null }).eq('id', contact.id);
  if (tellOwnerOnDelay) {
    await tellOwner(admin, owner.id, 'Due date moved', `${who} moved "${task.title}" to ${formatDayShort(chosen)}.`);
  }
  await replyTo(
    admin,
    contact,
    `Moved to ${formatDayShort(chosen)}. I told ${owner.name}. I'll check again that morning.`,
    task.id
  );
}
