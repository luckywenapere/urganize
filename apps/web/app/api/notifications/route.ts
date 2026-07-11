import { NextRequest, NextResponse } from 'next/server';
import {
  buildTaskSchemaResponse,
  requireAuthenticatedAdmin,
  isTaskSchemaMissingError,
  listNotifications,
} from '@/lib/tasks-server';

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

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
