// "What UrgAns did": turning action log rows into plain lines (client-safe).
//
// The rows come from urgans_action_log (see lib/urgans-action-log.ts) through
// GET /api/urgans/activity. This module only words them: one line for what
// changed, one for who asked and where. Mocks approved by the founder on
// 2026-10-27; see docs/notes/2026-10-27-urgans-action-log.md.

import type { UrgansActionSource } from './urgans-action-log';

export type UrgansActivityRow = {
  id: string;
  createdAt: string;
  source: UrgansActionSource;
  trigger: string;
  tool: string;
  actorUserId: string | null;
  releaseId: string | null;
  objectType: string | null;
  objectId: string | null;
  args: Record<string, unknown> | null;
  before: unknown;
  after: unknown;
  confirmed: boolean;
  ok: boolean;
  summary: string | null;
  error: string | null;
};

export type UrgansActivityIcon = 'message' | 'microphone' | 'whatsapp' | 'clock' | 'button' | 'plug' | 'memory';

export type UrgansActivityLine = {
  icon: UrgansActivityIcon;
  title: string;
  meta: string;
  failed: boolean;
  failure: string | null;
};

const ICONS: Record<UrgansActionSource, UrgansActivityIcon> = {
  chat: 'message',
  voice: 'microphone',
  mcp: 'plug',
  whatsapp: 'whatsapp',
  embedded: 'button',
  cron: 'clock',
  memory: 'memory',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** "2026-11-14" or a full timestamp → "14 Nov". Date-only strings are read as
 *  written, never shifted by a time zone. */
function shortDate(value: unknown): string {
  const raw = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return raw;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? ''}`.trim();
}

function firstName(full: string | undefined): string {
  return (full || '').trim().split(/\s+/)[0] || '';
}

function quote(name: string): string {
  return name ? `"${name}"` : '';
}

function objectName(row: UrgansActivityRow): string {
  const after = record(row.after);
  const before = record(row.before);
  const args = row.args || {};
  return (
    text(after?.title) ||
    text(before?.title) ||
    text(after?.name) ||
    text(before?.name) ||
    text(args.title) ||
    text(args.name) ||
    text(args.songTitle)
  );
}

function titleFor(row: UrgansActivityRow): string {
  const name = quote(objectName(row));
  const args = row.args || {};
  const before = record(row.before);
  const after = record(row.after);
  const with_ = (words: string, fallback: string) => (name ? `${words} ${name}` : fallback);

  switch (row.tool) {
    case 'create_task':
      return with_('Added task', 'Added a task');
    case 'update_task':
      return with_('Changed', 'Changed a task');
    case 'complete_task':
    case 'whatsapp.mark_done':
      return name ? `Marked ${name} done` : 'Marked a task done';
    case 'complete_tasks': {
      const count = Array.isArray(args.taskIds) ? args.taskIds.length : 0;
      return count > 1 ? `Marked ${count} tasks done` : 'Marked a task done';
    }
    case 'reopen_task':
      return with_('Reopened', 'Reopened a task');
    case 'delete_task':
      return with_('Deleted task', 'Deleted a task');
    case 'add_task_comment':
      return with_('Commented on', 'Added a comment');
    case 'whatsapp.move_due_date': {
      const to = shortDate(after?.due_date);
      return name ? `Moved ${name} to ${to}` : `Moved a task to ${to}`;
    }
    case 'whatsapp.chase': {
      const match = /^Chased (.+) on WhatsApp$/.exec(text(row.summary));
      return match ? `Reminded ${match[1]}` : 'Sent a reminder on WhatsApp';
    }
    case 'create_release':
      return with_('Started rollout', 'Started a rollout');
    case 'update_release':
      return with_('Changed rollout', 'Changed a rollout');
    case 'schedule_release': {
      const from = shortDate(before?.release_date);
      const to = shortDate(after?.release_date ?? args.releaseDate);
      if (from && to && from !== to) return `Moved release day from ${from} to ${to}`;
      return to ? `Set release day to ${to}` : 'Set the release day';
    }
    case 'delete_release':
      return with_('Deleted rollout', 'Deleted a rollout');
    case 'archive_release':
      return args.archived === false ? with_('Brought back', 'Brought back a rollout') : with_('Archived', 'Archived a rollout');
    case 'generate_release_plan':
      return with_('Built the plan for', 'Built a plan');
    case 'generate_status_update':
      return with_('Wrote a status update for', 'Wrote a status update');
    case 'update_release_metadata':
      return with_('Filled in details for', 'Filled in release details');
    case 'create_credits_link':
      return 'Made a credits link';
    case 'close_credits_link':
      return 'Closed the credits link';
    case 'create_artist':
      return with_('Added artist', 'Added an artist');
    case 'rename_artist':
      return name ? `Renamed an artist to ${name}` : 'Renamed an artist';
    case 'remove_artist':
      return with_('Removed artist', 'Removed an artist');
    case 'move_release_to_artist':
      return with_('Moved', 'Moved a rollout') + (name ? ' to another artist' : '');
    case 'create_press_kit':
      return 'Started a press kit';
    case 'update_press_kit':
    case 'write_press_kit_section':
      return 'Edited the press kit';
    case 'publish_press_kit':
      return 'Published the press kit';
    case 'unpublish_press_kit':
      return 'Took the press kit offline';
    case 'pitch_song':
      return with_('Pitched', 'Pitched a song');
    case 'generate_recap':
      return 'Made the recap';
    case 'delete_recap':
      return 'Deleted the recap';
    case 'invite_teammate':
      return text(args.email) ? `Invited ${text(args.email)}` : 'Invited a teammate';
    case 'remove_teammate':
      return 'Removed a teammate';
    case 'update_my_directory_profile':
      return 'Updated a directory profile';
    case 'save_artist_fact':
    case 'memory.save_fact': {
      const value = text(after?.value) || text(args.value);
      return value ? `Remembered "${value.slice(0, 80)}"` : 'Remembered a fact about an artist';
    }
    case 'forget_artist_fact':
    case 'memory.forget_fact': {
      const value = text(before?.value);
      return value ? `Forgot "${value.slice(0, 80)}"` : 'Forgot a fact about an artist';
    }
    case 'send_work_request':
      return 'Sent a work request';
    case 'answer_work_request':
      return 'Answered a work request';
  }
  const summary = text(row.summary);
  const sentence = /^.*?[.!?](?=\s|$)/.exec(summary)?.[0] ?? summary;
  return sentence.slice(0, 120) || 'Made a change';
}

function whenLabel(createdAt: string, now: Date): string {
  const at = new Date(Date.parse(createdAt) + LAGOS_OFFSET_MS);
  const today = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const dayKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const time = `${at.getUTCHours()}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
  if (dayKey(at) === dayKey(today)) return `Today, ${time}`;
  if (dayKey(at) === dayKey(yesterday)) return `Yesterday, ${time}`;
  return `${DAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

export function describeActivity(
  row: UrgansActivityRow,
  viewerId: string,
  names: Record<string, string>,
  now: Date = new Date()
): UrgansActivityLine {
  const who =
    row.actorUserId && row.actorUserId === viewerId
      ? 'You'
      : firstName(row.actorUserId ? names[row.actorUserId] : undefined) || 'Someone';
  const reply = text(row.args?.reply);

  let door: string;
  switch (row.source) {
    case 'chat':
      door = `${who} asked in chat`;
      break;
    case 'voice':
      door = `${who} asked on a voice call`;
      break;
    case 'mcp':
      door = `${who} asked from a connected app`;
      break;
    case 'whatsapp':
      door = reply ? `${who} replied "${reply.slice(0, 40)}" on WhatsApp` : `${who} replied on WhatsApp`;
      break;
    case 'embedded':
      door = `${who} used an UrgAns button`;
      break;
    case 'memory':
      door = row.trigger === 'artist_page' ? `${who} edited it on the artist page` : `${who} told UrgAns`;
      break;
    case 'cron':
    default:
      door = 'Daily check-in';
  }

  const parts = [door];
  if (row.confirmed) parts.push(`${who} approved it`);
  parts.push(whenLabel(row.createdAt, now));

  return {
    icon: ICONS[row.source] ?? 'message',
    title: titleFor(row),
    meta: parts.join(' · '),
    failed: !row.ok,
    failure: row.ok ? null : `Didn't work: ${text(row.error) || 'something went wrong.'}`,
  };
}

const SKIPPED_FIELDS = new Set(['id', 'created_at', 'updated_at', 'completed_at']);
const MAX_FIELDS = 6;

function fieldLabel(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function shownValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return shortDate(value);
  return String(value).slice(0, 80);
}

/** The fields that changed between two snapshots, for the row's details. */
export function diffSnapshots(before: unknown, after: unknown): Array<{ field: string; from: string; to: string }> {
  const a = record(before) ?? {};
  const b = record(after) ?? {};
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  const out: Array<{ field: string; from: string; to: string }> = [];
  for (const key of keys) {
    if (SKIPPED_FIELDS.has(key) || key.endsWith('_id')) continue;
    const from = a[key];
    const to = b[key];
    if ((from && typeof from === 'object') || (to && typeof to === 'object')) continue;
    if (from === to) continue;
    out.push({ field: fieldLabel(key), from: shownValue(from), to: shownValue(to) });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}
