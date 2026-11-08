import { NextRequest, NextResponse } from 'next/server';
import {
  buildReadOnlyResponse,
  ensureTaskAccess,
  isReadOnlyWorkspaceMember,
  loadProfilesByIds,
  requireAuthenticatedAdmin,
} from '@/lib/tasks-server';
import { canChaseByNumber, giveTaskToNumber, loadTaskChase, takeTaskFromNumber } from '@/lib/whatsapp/server';

// Chase by number on one activity (2026-11-08, #1119).
//   GET     whether this team can give tasks to a number, who has this one,
//           and the WhatsApp messages about it
//   POST    { name, phone } gives it to that person and asks for their YES
//   DELETE  takes it back from them
// Only owners and admins give work to someone outside the app, the same rule
// as adding a teammate's WhatsApp number in Settings.

type Context = { params: Promise<{ id: string }> };

async function resolve(request: NextRequest, context: Context, write: boolean) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return { error: auth.error ?? NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) } as const;
  const { id } = await context.params;
  if (!id) return { error: NextResponse.json({ error: 'Task id is required.' }, { status: 400 }) } as const;

  const access = await ensureTaskAccess(auth.adminClient, id, auth.user);
  if ('error' in access) return { error: access.error } as const;
  const workspaceId = access.task.workspace_id as string;

  if (write) {
    if (isReadOnlyWorkspaceMember(access.access, workspaceId)) return { error: buildReadOnlyResponse() } as const;
    const role = access.access.memberships.find((m) => m.workspaceId === workspaceId)?.role;
    if (role !== 'owner' && role !== 'admin') {
      return { error: NextResponse.json({ error: 'Only owners and admins can do this.' }, { status: 403 }) } as const;
    }
  }
  return { auth, taskId: id, workspaceId } as const;
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const target = await resolve(request, context, false);
    if ('error' in target) return target.error;
    const [available, chase] = await Promise.all([
      canChaseByNumber(target.auth.adminClient, target.workspaceId),
      loadTaskChase(target.auth.adminClient, target.workspaceId, target.taskId),
    ]);
    return NextResponse.json({ available, ...chase });
  } catch (error) {
    console.error('[whatsapp] task chase GET failed:', error);
    return NextResponse.json({ error: 'Could not load this.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const target = await resolve(request, context, true);
    if ('error' in target) return target.error;
    const body = (await request.json().catch(() => null)) as { name?: unknown; phone?: unknown } | null;
    const inviter = (await loadProfilesByIds(target.auth.adminClient, [target.auth.user.id])).get(target.auth.user.id);
    const result = await giveTaskToNumber(target.auth.adminClient, {
      workspaceId: target.workspaceId,
      taskId: target.taskId,
      actorUserId: target.auth.user.id,
      name: typeof body?.name === 'string' ? body.name : '',
      phoneRaw: typeof body?.phone === 'string' ? body.phone : '',
      inviterName: (inviter?.name || '').trim().split(/\s+/)[0] || 'Your team lead',
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ person: result.person, sent: result.sent, warning: result.warning ?? null });
  } catch (error) {
    console.error('[whatsapp] task chase POST failed:', error);
    return NextResponse.json({ error: 'Could not give this task.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const target = await resolve(request, context, true);
    if ('error' in target) return target.error;
    const ok = await takeTaskFromNumber(target.auth.adminClient, target.workspaceId, target.taskId);
    if (!ok) return NextResponse.json({ error: 'Could not change this.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[whatsapp] task chase DELETE failed:', error);
    return NextResponse.json({ error: 'Could not change this.' }, { status: 500 });
  }
}
