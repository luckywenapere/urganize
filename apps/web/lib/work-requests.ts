import { DIRECTORY_ROLES, type DirectoryRole } from './directory-roles';

/**
 * A manager asking somebody in the directory to work on a release.
 *
 * WHY THIS EXISTS. The directory shipped and stopped at "found them": a name,
 * a city and some counts, with nothing to do next. This is the move that
 * follows, and it is deliberately an approach rather than a message thread —
 * one ask, one answer. Anything longer belongs off-platform, and building a
 * conversation here is the inbox the out-of-scope list warns about.
 *
 * Pure, so the sender's form and the route run the same rules rather than two
 * copies that drift. lib/work-requests-server.ts is the I/O half.
 */

export const WORK_REQUEST_STATUSES = ['new', 'interested', 'passed'] as const;
export type WorkRequestStatus = (typeof WORK_REQUEST_STATUSES)[number];

/** Long enough to say what the job is, short enough that nobody writes a brief
 *  into it. Same cap a pitch note carries, and the CHECK enforces it too. */
export const WORK_REQUEST_NOTE_MAX_CHARS = 300;
export const WORK_REQUEST_REPLY_MAX_CHARS = 300;

/**
 * Open requests one team may have out at once.
 *
 * This is a cold-start marketplace and the failure mode is one manager
 * approaching every designer on the list at once, which would empty the
 * directory of people faster than it fills. Answered requests do not count, so
 * a team that follows up on what it sent is never blocked.
 */
export const MAX_OPEN_REQUESTS_PER_TEAM = 10;

/**
 * EXACTLY WHAT THE RECIPIENT'S SIDE MAY SELECT, and the rule the whole table is
 * shaped around.
 *
 * `release_id` is absent, and that is the point rather than an omission: an
 * unannounced release title must never reach somebody who is about to say no.
 * `workspace_id` and `sender_user_id` are absent for the same reason the
 * curator pitch columns leave out every id — a read path that cannot reach
 * team data cannot leak it by mistake. What is left is who asked, which role,
 * the note they chose to write, and what has been answered.
 */
export const RECIPIENT_REQUEST_FIELDS = [
  'id',
  'role',
  'note',
  'status',
  'reply',
  'sender_name',
  'sender_team',
  'created_at',
  'answered_at',
] as const;

export type WorkRequestInput = {
  recipientUserId: string;
  role: DirectoryRole;
  note: string;
  releaseId: string | null;
};

const isRole = (value: unknown): value is DirectoryRole =>
  typeof value === 'string' && (DIRECTORY_ROLES as readonly string[]).includes(value);

export function parseWorkRequestInput(
  body: unknown
): { error: string } | { input: WorkRequestInput } {
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const recipientUserId = typeof payload.recipientUserId === 'string' ? payload.recipientUserId.trim() : '';
  if (!recipientUserId) return { error: 'Pick somebody to ask.' };

  if (!isRole(payload.role)) return { error: 'Pick the job you need done.' };

  const note = typeof payload.note === 'string' ? payload.note.trim() : '';
  if (!note) return { error: 'Say what the work is.' };
  if (note.length > WORK_REQUEST_NOTE_MAX_CHARS) {
    // Refused rather than truncated: cutting somebody's sentence in half and
    // sending it anyway is worse than telling them it is too long.
    return { error: `Keep it to ${WORK_REQUEST_NOTE_MAX_CHARS} characters or fewer.` };
  }

  // A manager can reach out from the directory with no release in hand. That
  // is a legitimate ask, so an absent release is a null and not an error.
  const releaseId = typeof payload.releaseId === 'string' && payload.releaseId.trim()
    ? payload.releaseId.trim()
    : null;

  return { input: { recipientUserId, role: payload.role, note, releaseId } };
}

export type WorkRequestAnswer = { status: 'interested' | 'passed'; reply: string | null };

export function parseWorkRequestAnswer(
  body: unknown
): { error: string } | { answer: WorkRequestAnswer } {
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  // `new` is the state a request is born in, not an answer, so it is not
  // offered here even though it is a legal column value.
  if (payload.status !== 'interested' && payload.status !== 'passed') {
    return { error: 'Say whether you are interested.' };
  }

  const raw = typeof payload.reply === 'string' ? payload.reply.trim() : '';
  if (raw.length > WORK_REQUEST_REPLY_MAX_CHARS) {
    return { error: `Keep your reply to ${WORK_REQUEST_REPLY_MAX_CHARS} characters or fewer.` };
  }

  return { answer: { status: payload.status, reply: raw || null } };
}

/**
 * ONLY THE RECIPIENT MOVES A STATUS, and only once.
 *
 * The sender must never be able to mark their own approach as accepted, and a
 * second answer would rewrite something the sender may already have acted on.
 */
export function canAnswerWorkRequest(
  request: { recipientUserId: string; status: WorkRequestStatus },
  userId: string
): boolean {
  return request.recipientUserId === userId && request.status === 'new';
}

/** Fails OPEN on a count that could not be read, like every other counter in
 *  this codebase: wrongly refusing somebody's first approach is worse than
 *  wrongly allowing an extra one. */
export function withinOpenRequestCap(openCount: number | null): boolean {
  if (openCount === null) return true;
  return openCount < MAX_OPEN_REQUESTS_PER_TEAM;
}

const STATUS_COPY: Record<WorkRequestStatus, string> = {
  new: 'Waiting',
  interested: 'Interested',
  passed: 'Passed',
};

export function describeRequestStatus(status: WorkRequestStatus): string {
  return STATUS_COPY[status];
}
