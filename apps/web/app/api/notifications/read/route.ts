import { NextRequest, NextResponse } from 'next/server';
import {
  NOTIFICATIONS_TABLE,
  buildTaskSchemaResponse,
  createAdminClient,
  requireActiveAuthenticatedUser,
  isTaskSchemaMissingError,
} from '@/lib/tasks-server';

type MarkNotificationsReadBody = {
  notificationIds?: unknown;
};

const readString = (value: unknown): string => String(value || '').trim();

export async function PATCH(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as MarkNotificationsReadBody;
    const notificationIds = Array.isArray(body.notificationIds)
      ? body.notificationIds.map((value) => readString(value)).filter(Boolean)
      : [];

    let query = adminClient.from(NOTIFICATIONS_TABLE).update({ read: true }).eq('user_id', auth.user.id).eq('read', false);
    if (notificationIds.length) {
      query = query.in('id', notificationIds);
    }

    const result = await query;
    if (result.error) {
      if (isTaskSchemaMissingError(result.error)) {
        return buildTaskSchemaResponse();
      }

      return NextResponse.json(
        { error: result.error.message || 'Could not update notifications.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update notifications.' },
      { status: 500 }
    );
  }
}
