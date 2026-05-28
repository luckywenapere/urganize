import { NextRequest, NextResponse } from 'next/server';
import {
  buildTaskSchemaResponse,
  createAdminClient,
  requireActiveAuthenticatedUser,
  isTaskSchemaMissingError,
  listNotifications,
} from '@/lib/tasks-server';

export async function GET(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) {
    return auth.error;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  try {
    const notifications = await listNotifications(adminClient, auth.user);
    return NextResponse.json({
      notifications,
      unreadCount: notifications.filter((notification) => !notification.read).length,
    });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load notifications.' },
      { status: 500 }
    );
  }
}
