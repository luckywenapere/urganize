// The UrgAns action log, pure half (client-safe, no IO).
//
// One row for every write UrgAns makes, from every door: chat, a voice call,
// MCP, a WhatsApp reply, an embedded action button, a cron sweep, and the
// memory UrgAns keeps. The point is trust: once UrgAns acts on its own, every
// action has to be traceable to who asked, what triggered it, and what it
// changed. The writer is lib/urgans-action-log-server.ts; the table is
// supabase/migrations/20261027120000_urgans_action_log.sql. See
// docs/notes/2026-10-27-urgans-action-log.md.

/**
 * How much a tool may do on its own. Every tool in the Chappi registry carries
 * one, and tool-registry.test.ts holds it to the real mechanisms:
 *   read    reads only, never logged.
 *   suggest proposes or opens something the user then acts on (a page, a
 *           picker), changes nothing, never logged.
 *   confirm writes only after the user approves a card (the tool has a
 *           confirm builder; the runner refuses to run it from the model loop).
 *   auto    writes straight away when asked.
 */
export const URGANS_TOOL_LEVELS = ['read', 'suggest', 'confirm', 'auto'] as const;
export type UrgansToolLevel = (typeof URGANS_TOOL_LEVELS)[number];

/** Which door an action came through. Free to grow; the column is checked
 *  against this list in the migration, so add both together. */
export const URGANS_ACTION_SOURCES = [
  'chat',
  'voice',
  'mcp',
  'whatsapp',
  'embedded',
  'cron',
  'memory',
] as const;
export type UrgansActionSource = (typeof URGANS_ACTION_SOURCES)[number];

/** Only writes are logged. */
export function isLoggedLevel(level: UrgansToolLevel): boolean {
  return level === 'confirm' || level === 'auto';
}

/** What a tool call is about, read from its arguments. Most specific id wins:
 *  a task inside a release is about the task. */
export type LogObject = { type: string; ids: string[] };

const OBJECT_KEYS: Array<[key: string, type: string]> = [
  ['taskId', 'task'],
  ['postId', 'content_post'],
  ['calendarId', 'content_calendar'],
  ['noteId', 'note'],
  ['factId', 'artist_fact'],
  ['kitId', 'press_kit'],
  ['requestId', 'work_request'],
  ['memberId', 'workspace_member'],
  ['releaseId', 'release'],
  ['artistId', 'artist'],
];

export function resolveLogObject(args: Record<string, unknown>): LogObject | null {
  const taskIds = args.taskIds;
  if (Array.isArray(taskIds)) {
    const ids = taskIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
    if (ids.length > 0) return { type: 'task', ids };
  }
  for (const [key, type] of OBJECT_KEYS) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return { type, ids: [value.trim()] };
  }
  return null;
}

/** Keeps a JSON value under a size cap so one big row (a long note, a press kit
 *  section) cannot bloat the log. Too big becomes a marker with its size. */
export function capJson(value: unknown, maxChars = 8000): unknown {
  if (value === undefined || value === null) return null;
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return { unserialisable: true };
  }
  if (text === undefined) return null;
  if (text.length > maxChars) return { truncated: true, chars: text.length };
  return JSON.parse(text);
}

export type UrgansActionLogInput = {
  source: UrgansActionSource;
  /** What set it off: 'message', 'confirmed_card', 'whatsapp_reply',
   *  'daily_sweep', 'button'. Free text. */
  trigger: string;
  /** A Chappi tool name, or a dotted name for actions outside the registry
   *  ('whatsapp.mark_done', 'embedded.release.draft_plan'). */
  tool: string;
  level: UrgansToolLevel;
  /** The person UrgAns acted for. Null for a sweep with nobody behind it. */
  actorUserId?: string | null;
  workspaceId?: string | null;
  releaseId?: string | null;
  objectType?: string | null;
  objectId?: string | null;
  args?: unknown;
  before?: unknown;
  after?: unknown;
  /** True only when a person approved this exact action first. */
  confirmed?: boolean;
  ok: boolean;
  summary?: string | null;
  error?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidOrNull(value: string | null | undefined): string | null {
  return value && UUID.test(value) ? value : null;
}
function cut(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

/** The insert row. Uuid columns drop anything that is not a uuid, so a model's
 *  made-up id can never make the log insert fail. */
export function buildActionLogRow(input: UrgansActionLogInput) {
  return {
    source: input.source,
    trigger: cut(input.trigger, 80) ?? 'unknown',
    tool: cut(input.tool, 120) ?? 'unknown',
    level: input.level,
    actor_user_id: uuidOrNull(input.actorUserId),
    workspace_id: uuidOrNull(input.workspaceId),
    release_id: uuidOrNull(input.releaseId),
    object_type: cut(input.objectType, 60),
    object_id: cut(input.objectId, 120),
    args: capJson(input.args),
    before: capJson(input.before),
    after: capJson(input.after),
    confirmed: input.confirmed === true,
    ok: input.ok,
    summary: cut(input.summary, 500),
    error: cut(input.error, 500),
  };
}
