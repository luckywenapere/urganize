import { NextRequest, NextResponse } from 'next/server';
import {
  NOTIFICATIONS_TABLE,
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

// Clear ALL of the caller's notifications (founder call, 2026-07-23). Rows
// are the user's own transient inbox entries — hard delete, owner-scoped;
// no body, no partial mode (per-row dismissal can come later if needed).
export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) {
    return auth.error;
  }

  const { adminClient } = auth;

  try {
    const result = await adminClient
      .from(NOTIFICATIONS_TABLE)
      .delete()
      .eq('user_id', auth.user.id);
    if (result.error) {
      if (isTaskSchemaMissingError(result.error)) {
        return buildTaskSchemaResponse();
      }
      return NextResponse.json(
        { error: result.error.message || 'Could not clear notifications.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isTaskSchemaMissingError(error)) {
      return buildTaskSchemaResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not clear notifications.' },
      { status: 500 }
    );
  }
}
