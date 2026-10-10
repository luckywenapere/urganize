import { NextResponse, type NextRequest } from 'next/server';
import {
  canAnswerWorkRequest,
  effectiveRequestStatus,
  parseWorkRequestAnswer,
  workRequestCutoff,
  type WorkRequestStatus,
} from '@/lib/work-requests';
import { notifyWorkRequestAnswer } from '@/lib/work-requests-server';
import { startWorkFromRequest, type StartRequestRow } from '@/lib/work-request-start-server';
import { describeStartResult, type StartResult } from '@/lib/work-request-start';
import {
  WORK_REQUESTS_TABLE,
  asRow,
  createAdminClient,
  directoryDisabledResponse,
  isWorkRequestsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../../_shared';

/**
 * Answering a request: interested, or passed, with an optional line back.
 *
 * ONLY THE RECIPIENT MAY MOVE A STATUS, and only once. The sender must never
 * be able to mark their own approach accepted, and a second answer would
 * rewrite something the sender may already have acted on —
 * `canAnswerWorkRequest` is the pure, unit-tested rule and this route is its
 * only caller.
 *
 * A refusal is a 404 rather than a 403, so a request that is not yours is
 * indistinguishable from one that does not exist.
 */

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  if (!isWorkRequestsFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { requestId } = await context.params;
  if (!requestId) return NextResponse.json({ error: 'Which request?' }, { status: 400 });

  const parsed = parseWorkRequestAnswer(await request.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { answer } = parsed;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // Everything the start needs is read here, server side, and none of it is
  // sent back: the release and the activity stay hidden from the recipient. The
  // spec's new columns may not exist yet, so a read that fails on one retries
  // with the columns that always did and the request simply cannot start.
  const START_COLUMNS = 'workspace_id, release_id, task_id, next_release, sender_team';
  const BASE_COLUMNS = 'id, recipient_user_id, sender_user_id, status, role, sender_name, created_at';
  const withStart = await adminClient
    .from(WORK_REQUESTS_TABLE)
    .select(`${BASE_COLUMNS}, ${START_COLUMNS}`)
    .eq('id', requestId)
    .maybeSingle();
  let existing = withStart.data;
  if (withStart.error && String(withStart.error.code || '') === '42703') {
    ({ data: existing } = await adminClient
      .from(WORK_REQUESTS_TABLE)
      .select(BASE_COLUMNS)
      .eq('id', requestId)
      .maybeSingle());
  }

  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const row = asRow(existing);
  const storedStatus = String(row.status || 'new') as WorkRequestStatus;
  const createdAt = typeof row.created_at === 'string' ? row.created_at : null;
  const answerable = canAnswerWorkRequest(
    {
      recipientUserId: String(row.recipient_user_id || ''),
      status: storedStatus,
      createdAt,
    },
    auth.user.id
  );

  if (!answerable) {
    // Already answered, or closed after seven days, is a different thing from
    // not yours, and the recipient deserves to be told which. A stranger gets
    // the flat 404 above.
    if (String(row.recipient_user_id || '') === auth.user.id) {
      if (effectiveRequestStatus(storedStatus, createdAt) === 'expired') {
        return NextResponse.json(
          { error: 'This request closed after 7 days with no answer.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'You already answered this one.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { data, error } = await adminClient
    .from(WORK_REQUESTS_TABLE)
    .update({ status: answer.status, reply: answer.reply, answered_at: new Date().toISOString() })
    // Conditional on the status, so two taps cannot both land: the row is the
    // lock, the same call the curator invite and the plan claim both make.
    .eq('id', requestId)
    .eq('status', 'new')
    // And still inside its seven days, so an answer cannot land in the gap
    // between the check above and the update on a request that has just closed.
    .gte('created_at', workRequestCutoff())
    .select('id, role, note, status, reply, sender_name, sender_team, created_at, answered_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save that.' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'You already answered this one.' }, { status: 409 });
  }

  // "Accept and start" is asked for outright (parseWorkRequestAnswer only lets a
  // yes carry it) and runs AFTER the answer is saved, so a failure can never
  // lose the yes. startWorkFromRequest answers null when there is nothing to
  // start, which is most requests and is not a problem.
  let start: StartResult | null = null;
  if (answer.start) {
    start = await startWorkFromRequest(
      adminClient,
      {
        id: requestId,
        sender_user_id: String(row.sender_user_id || ''),
        recipient_user_id: auth.user.id,
        workspace_id: typeof row.workspace_id === 'string' ? row.workspace_id : null,
        role: String(row.role || ''),
        release_id: typeof row.release_id === 'string' ? row.release_id : null,
        task_id: typeof row.task_id === 'string' ? row.task_id : null,
        next_release: typeof row.next_release === 'string' ? row.next_release : null,
        // For a manager ask the artist is the sender, so this is the artist's name.
        sender_name: String(row.sender_name || ''),
      } satisfies StartRequestRow,
      auth.user
    );
  }

  // Who "they" are in the sentence the answerer reads: the team that asked them
  // to do a job, or the artist who asked them to manage.
  const otherName =
    start?.kind === 'hire_join'
      ? String(row.sender_team || row.sender_name || '')
      : String(row.sender_name || '');

  await notifyWorkRequestAnswer(adminClient, {
    senderUserId: String(row.sender_user_id || ''),
    recipientUserId: auth.user.id,
    role: String(row.role || ''),
    status: answer.status,
    reply: answer.reply,
    start,
  });

  return NextResponse.json({
    request: asRow(data),
    start: start
      ? {
          status: start.status,
          kind: start.kind,
          releaseId: start.status === 'started' ? start.releaseId : null,
          message: describeStartResult(start, { otherName }),
        }
      : null,
  });
}
