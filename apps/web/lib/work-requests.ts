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

/**
 * `expired` is a request that nobody answered in time. It is something that
 * happens TO a request, never an answer a person gives, so
 * `parseWorkRequestAnswer` refuses it and only the daily sweep writes it.
 */
export const WORK_REQUEST_STATUSES = ['new', 'interested', 'passed', 'expired'] as const;
export type WorkRequestStatus = (typeof WORK_REQUEST_STATUSES)[number];

/**
 * How long a request waits for an answer before it closes (the directory
 * spec, "From profile to working together": accepts, declines, or does not
 * reply in 7 days and it closes). Closing it frees the sender's open slot and
 * the one-open-request-per-person guard, so they can ask somebody else, or ask
 * again.
 */
export const WORK_REQUEST_EXPIRY_DAYS = 7;

/** Long enough to say what the job is, short enough that nobody writes a brief
 *  into it. Same cap a pitch note carries, and the CHECK enforces it too. */
export const WORK_REQUEST_NOTE_MAX_CHARS = 300;
export const WORK_REQUEST_REPLY_MAX_CHARS = 300;

/**
 * THE TWO FIELDS THE SPEC ADDS TO A REQUEST (directory spec, "From profile to
 * working together": "next release, links, what they need"). The note stays
 * "what they need". These are the other two, and both are short on purpose, for
 * the reason the note is: a request is an approach, not a brief.
 *
 * The next release is a line of TEXT the sender typed for this one purpose,
 * never a release id. That is what lets the recipient see it without breaking
 * the rule the table is shaped around (the recipient never sees `release_id`):
 * the sender chose to say it, the same way they chose the words of the note.
 */
export const WORK_REQUEST_NEXT_RELEASE_MAX_CHARS = 120;
export const WORK_REQUEST_LINKS_MAX = 3;
export const WORK_REQUEST_LINK_MAX_CHARS = 300;

/**
 * How many people one team may have on a rollout as a hire. A hire does not take
 * a seat (see lib/work-request-start.ts), so this is the ceiling that stops
 * "hire" from becoming a way to run a ten-person team on a one-seat plan.
 */
export const MAX_HIRES_PER_TEAM = 10;

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
  // What the sender chose to tell them about the next release, as text. It is
  // not the release: see WORK_REQUEST_NEXT_RELEASE_MAX_CHARS.
  'next_release',
  'links',
  'status',
  'reply',
  'sender_name',
  'sender_team',
  'created_at',
  'answered_at',
] as const;

/**
 * WHAT THE SENDER'S OWN SIDE MAY SELECT.
 *
 * The mirror image of the list above, and deliberately not symmetrical with
 * it: this one DOES carry `release_id`, because the sender needs to know which
 * release they asked for, and that is exactly the field the recipient must
 * never see.
 *
 * No contact column appears here, and none exists on the table. Contact is
 * resolved at read time and only for a request that has been answered
 * `interested` — a stored copy would outlive the consent that revealed it.
 */
export const SENDER_REQUEST_FIELDS = [
  'id',
  'role',
  'note',
  'next_release',
  'links',
  'status',
  'reply',
  'recipient_user_id',
  'release_id',
  'task_id',
  // Set once an accepted request has started real work: the rollout the two
  // people are now on together. `started_at` is when.
  'shared_release_id',
  'started_at',
  'created_at',
  'answered_at',
] as const;

/**
 * WHETHER THIS ANSWER HANDS THE ASKER A WAY TO REACH THE PERSON.
 *
 * The consent model in one function. Saying you are interested in working on
 * somebody's release IS the permission to be contacted, so there is no second
 * opt-in question after it — a question nobody expects at that moment is a
 * question most people ignore, and the request then dies at "yes" with no way
 * to proceed, which is the hole this closes.
 *
 * Somebody who passed has agreed to nothing and reveals nothing. A request
 * still waiting reveals nothing either, which matters because the sender's
 * list renders every row.
 */
export function revealsContact(status: WorkRequestStatus): boolean {
  return status === 'interested';
}

/**
 * The columns that existed before the spec's extra fields, kept so a read can
 * fall back to them (on Postgres 42703, undefined column) when the migration
 * that adds the new ones has not been applied yet. The inbox must keep working
 * between a deploy and a hand-applied migration, so this is a retry with fewer
 * columns, never a reason to show an error. Both lists are subsets of the
 * current ones, and a test holds that.
 */
export const LEGACY_RECIPIENT_REQUEST_FIELDS = RECIPIENT_REQUEST_FIELDS.filter(
  (field) => field !== 'next_release' && field !== 'links'
);
export const LEGACY_SENDER_REQUEST_FIELDS = SENDER_REQUEST_FIELDS.filter(
  (field) =>
    field !== 'next_release' &&
    field !== 'links' &&
    field !== 'task_id' &&
    field !== 'shared_release_id' &&
    field !== 'started_at'
);

export type WorkRequestInput = {
  recipientUserId: string;
  role: DirectoryRole;
  note: string;
  releaseId: string | null;
  /** A line about what the sender is putting out next. Text, never an id. */
  nextRelease: string | null;
  /** Up to three https links (a demo, a past release, a page). */
  links: string[];
  /** The activity the sender is hiring for, when they came from one. */
  taskId: string | null;
};

const isRole = (value: unknown): value is DirectoryRole =>
  typeof value === 'string' && (DIRECTORY_ROLES as readonly string[]).includes(value);

/** A link somebody else's browser will follow: http and https only. A
 *  `javascript:` or `data:` link is the one field here that could hurt a reader
 *  rather than merely look wrong, the same rule a profile link follows. */
function isSafeLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Whether asking this role needs a line about the next release. An artist
 * asking a MANAGER is the case the spec leads with, and a manager cannot judge
 * a request that does not say what is being released, so it is required there
 * and optional for every other job (a designer's brief is the note itself).
 */
export function requiresNextRelease(role: DirectoryRole): boolean {
  return role === 'manager';
}

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

  const nextRaw = typeof payload.nextRelease === 'string' ? payload.nextRelease.trim() : '';
  if (nextRaw.length > WORK_REQUEST_NEXT_RELEASE_MAX_CHARS) {
    return {
      error: `Keep the next release to ${WORK_REQUEST_NEXT_RELEASE_MAX_CHARS} characters or fewer.`,
    };
  }
  if (requiresNextRelease(payload.role) && !nextRaw) {
    return { error: 'Say what you are releasing next.' };
  }

  const rawLinks = Array.isArray(payload.links)
    ? payload.links
    : typeof payload.links === 'string' && payload.links.trim()
      ? [payload.links]
      : [];
  const links: string[] = [];
  for (const entry of rawLinks) {
    if (typeof entry !== 'string') return { error: 'A link has to be text.' };
    const link = entry.trim();
    // A blank line in the box is not a link, and not an error either.
    if (!link) continue;
    if (link.length > WORK_REQUEST_LINK_MAX_CHARS) return { error: 'One of those links is too long.' };
    if (!isSafeLink(link)) return { error: 'A link has to start with http or https.' };
    if (!links.includes(link)) links.push(link);
  }
  if (links.length > WORK_REQUEST_LINKS_MAX) {
    return { error: `Add up to ${WORK_REQUEST_LINKS_MAX} links.` };
  }

  const taskId = typeof payload.taskId === 'string' && payload.taskId.trim()
    ? payload.taskId.trim()
    : null;

  return {
    input: {
      recipientUserId,
      role: payload.role,
      note,
      releaseId,
      nextRelease: nextRaw || null,
      links,
      // A task only means something on a release; carrying one without the
      // other would let a request point at work it cannot name.
      taskId: releaseId ? taskId : null,
    },
  };
}

/**
 * WHAT SAYING YES CAN START. The directory ends where a shared rollout begins
 * (spec, "From profile to working together"), and there are two ways in:
 *
 *   `manager_rollout`  an artist asked a MANAGER. The manager runs the rollout,
 *                      so it is made in the manager's team and the artist is
 *                      added to it.
 *   `hire_join`        a manager asked a creative for a job on a rollout they
 *                      already have. The person joins that rollout's team as a
 *                      hire, on the one activity if one was named.
 *
 * Anything else (a request with no rollout behind it) has nothing to start, and
 * saying yes is still just "I am interested", as before.
 */
export type WorkRequestStartKind = 'manager_rollout' | 'hire_join';

export function startKindFor(request: {
  role: DirectoryRole | string;
  releaseId: string | null;
}): WorkRequestStartKind | null {
  if (request.role === 'manager') return 'manager_rollout';
  return request.releaseId ? 'hire_join' : null;
}

export type WorkRequestAnswer = {
  status: 'interested' | 'passed';
  reply: string | null;
  /** The recipient chose "accept and start". Only meaningful with a yes, and
   *  only honoured when startKindFor says there is something to start. */
  start: boolean;
};

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

  // Starting work is a bigger yes than "interested": it puts somebody on a
  // team. So it has to be asked for outright, and a pass can never carry it.
  const start = payload.status === 'interested' && payload.start === true;

  return { answer: { status: payload.status, reply: raw || null, start } };
}

/**
 * ONLY THE RECIPIENT MOVES A STATUS, and only once.
 *
 * The sender must never be able to mark their own approach as accepted, and a
 * second answer would rewrite something the sender may already have acted on.
 */
export function canAnswerWorkRequest(
  request: { recipientUserId: string; status: WorkRequestStatus; createdAt?: string | null },
  userId: string,
  now: Date | number = Date.now()
): boolean {
  if (request.recipientUserId !== userId) return false;
  // A request that has run out its seven days is closed even if the sweep has
  // not got to it yet, so a late answer cannot land on something the sender
  // has already been told is over.
  return effectiveRequestStatus(request.status, request.createdAt ?? null, now) === 'new';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The moment before which a still-waiting request counts as closed. ONE place
 * computes it, and the list read, the answer route, the open-request count and
 * the daily sweep all compare against it with a strict "created before", so a
 * request made exactly seven days ago is the last one that can still be
 * answered everywhere at once.
 */
export function workRequestCutoff(now: Date | number = Date.now()): string {
  const at = now instanceof Date ? now.getTime() : now;
  return new Date(at - WORK_REQUEST_EXPIRY_DAYS * DAY_MS).toISOString();
}

/** A request is stale when it is still waiting and is older than the cutoff.
 *  An unreadable date is never stale: closing somebody's ask on a guess is the
 *  wrong way to be wrong. */
export function isWorkRequestStale(
  request: { status: WorkRequestStatus; createdAt: string | null },
  now: Date | number = Date.now()
): boolean {
  if (request.status !== 'new') return false;
  const created = request.createdAt ? Date.parse(request.createdAt) : NaN;
  if (!Number.isFinite(created)) return false;
  return created < Date.parse(workRequestCutoff(now));
}

/**
 * WHAT A REQUEST SHOULD READ AS RIGHT NOW. The stored status says `new` until
 * the sweep has run (it runs once a day) and until the migration that allows
 * `expired` has been applied, so every read goes through this instead of
 * trusting the column. The product is therefore correct from the moment this
 * ships, between sweeps, and in an environment where the migration has not
 * landed yet.
 */
export function effectiveRequestStatus(
  status: WorkRequestStatus,
  createdAt: string | null,
  now: Date | number = Date.now()
): WorkRequestStatus {
  return isWorkRequestStale({ status, createdAt }, now) ? 'expired' : status;
}

/** The rows a route hands back, with every stale waiting request read as
 *  closed. Returns new objects, never the rows it was given. */
export function withEffectiveStatus<T extends { status?: unknown; created_at?: unknown }>(
  rows: T[],
  now: Date | number = Date.now()
): T[] {
  return rows.map((row) => ({
    ...row,
    status: effectiveRequestStatus(
      String(row.status ?? 'new') as WorkRequestStatus,
      typeof row.created_at === 'string' ? row.created_at : null,
      now
    ),
  }));
}

/**
 * "NOT TAKING WORK" MEANS NOT TAKING REQUESTS. The profile has always offered
 * the setting, and its own hint says "People know not to ask yet", but nothing
 * enforced it: a request went through to somebody who had said no. An unknown
 * value fails OPEN, since refusing every request to a person over a data
 * problem is the wrong way to handle one.
 */
export function canReceiveRequests(availability: string | null | undefined): boolean {
  return availability !== 'closed';
}

export function refusalForClosedAvailability(name: string): string {
  const who = name.trim() || 'This person';
  return `${who} is not taking work right now.`;
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
  expired: 'Closed',
};

export function describeRequestStatus(status: WorkRequestStatus): string {
  return STATUS_COPY[status];
}
