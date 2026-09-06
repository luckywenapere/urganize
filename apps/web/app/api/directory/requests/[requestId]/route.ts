import { NextResponse, type NextRequest } from 'next/server';
import { canAnswerWorkRequest, parseWorkRequestAnswer, type WorkRequestStatus } from '@/lib/work-requests';
import { notifyWorkRequestAnswer } from '@/lib/work-requests-server';
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
    .select('id, recipient_user_id, sender_user_id, status, role, sender_name')
    .eq('id', requestId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const row = asRow(existing);
  const answerable = canAnswerWorkRequest(
    {
      recipientUserId: String(row.recipient_user_id || ''),
      status: String(row.status || 'new') as WorkRequestStatus,
    },
    auth.user.id
  );

  if (!answerable) {
    // Already answered is a different thing from not yours, and the recipient
    // deserves to be told which. A stranger gets the flat 404 above.
    if (String(row.recipient_user_id || '') === auth.user.id) {
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

  await notifyWorkRequestAnswer(adminClient, {
    senderUserId: String(row.sender_user_id || ''),
    recipientUserId: auth.user.id,
    role: String(row.role || ''),
    status: answer.status,
    reply: answer.reply,
  });

  return NextResponse.json({ request: asRow(data) });
}
