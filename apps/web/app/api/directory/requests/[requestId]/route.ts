import { NextResponse, type NextRequest } from 'next/server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { assignPersonToTask, startSharedRollout } from '@/lib/work-request-collab-server';
import {
  canAnswerWorkRequest,
  decideAnswerEffect,
  effectiveRequestStatus,
  parseWorkRequestAnswer,
  workRequestCutoff,
  type WorkRequestStatus,
} from '@/lib/work-requests';
import { notifyWorkRequestAnswer } from '@/lib/work-requests-server';
import { captureRequestAnswered } from '@/lib/directory-events-server';
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

  const { data: existing } = await adminClient
    .from(WORK_REQUESTS_TABLE)
    .select(
      'id, recipient_user_id, sender_user_id, status, role, sender_name, created_at, kind, task_id, release_id, ask_release_note'
    )
    .eq('id', requestId)
    .maybeSingle();

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
    .select(
      'id, role, kind, note, ask_links, ask_release_note, status, reply, sender_name, sender_team, created_at, answered_at'
    )
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

  // WHAT SAYING YES DOES. The answer is already recorded and that row is the
  // lock, so the work below cannot be started twice. A shared rollout that
  // cannot be started (no seat, no room for another rollout) hands the status
  // back to waiting and says why, so a yes never means nothing happened.
  const effect = decideAnswerEffect({
    kind: row.kind === 'manager' ? 'manager' : 'crew',
    taskId: typeof row.task_id === 'string' ? row.task_id : null,
    status: answer.status,
  });

  let share: { releaseId: string; artistName: string; addedToTeam: boolean } | null = null;
  let assignment: string | null = null;

  if (effect === 'start_share') {
    const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
    const started = await startSharedRollout(adminClient, {
      acceptorUserId: auth.user.id,
      workspaceId: team.primaryWorkspaceId,
      senderUserId: String(row.sender_user_id || ''),
      senderName: String(row.sender_name || ''),
      askReleaseNote: typeof row.ask_release_note === 'string' ? row.ask_release_note : null,
    });
    if (!started.ok) {
      await adminClient
        .from(WORK_REQUESTS_TABLE)
        .update({ status: 'new', reply: null, answered_at: null })
        .eq('id', requestId)
        .eq('status', 'interested');
      if ('block' in started) {
        return NextResponse.json(
          { error: started.block.message, reason: started.block.code },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: started.error }, { status: 500 });
    }
    share = {
      releaseId: started.releaseId,
      artistName: started.artistName,
      addedToTeam: started.addedToTeam,
    };
    await adminClient
      .from(WORK_REQUESTS_TABLE)
      .update({ accepted_release_id: started.releaseId, shared_at: new Date().toISOString() })
      .eq('id', requestId);
  } else if (effect === 'assign_task') {
    assignment = await assignPersonToTask(adminClient, {
      taskId: String(row.task_id),
      requestReleaseId: typeof row.release_id === 'string' ? row.release_id : null,
      recipientUserId: auth.user.id,
    });
    if (assignment === 'link') {
      await adminClient
        .from(WORK_REQUESTS_TABLE)
        .update({ assigned_at: new Date().toISOString() })
        .eq('id', requestId);
    }
  }

  await notifyWorkRequestAnswer(adminClient, {
    senderUserId: String(row.sender_user_id || ''),
    recipientUserId: auth.user.id,
    role: String(row.role || ''),
    status: answer.status,
    reply: answer.reply,
  });

  captureRequestAnswered(auth.user.id, {
    role: row.role,
    createdAt,
    reply: answer.reply,
    status: answer.status,
  });

  return NextResponse.json({ request: asRow(data), share, assignment });
}
