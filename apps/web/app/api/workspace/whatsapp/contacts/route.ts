import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext, loadProfilesByIds } from '@/lib/tasks-server';
import { addContactAndInvite, removeContact } from '@/lib/whatsapp/server';

// Add (or change) a teammate's WhatsApp number and send them the one-time
// opt-in message. Nothing is chased until they reply YES.

type Access = Awaited<ReturnType<typeof loadWorkspaceAccessContext>>;

function canManage(access: Access, workspaceId: string): boolean {
  const role = access.memberships.find((m) => m.workspaceId === workspaceId)?.role;
  return role === 'owner' || role === 'admin';
}

async function resolveTarget(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return { error: auth.error } as const;

  const body = (await request.json().catch(() => null)) as { userId?: unknown; phone?: unknown } | null;
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  if (!userId) return { error: NextResponse.json({ error: 'Choose a person.' }, { status: 400 }) } as const;

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  const workspaceId = access.primaryWorkspaceId;
  if (!workspaceId) return { error: NextResponse.json({ error: 'No team found.' }, { status: 404 }) } as const;
  if (!canManage(access, workspaceId)) {
    return { error: NextResponse.json({ error: 'Only owners and admins can change this.' }, { status: 403 }) } as const;
  }

  // The person has to be on this team. Never trust a userId from the browser.
  const { data: member } = await auth.adminClient
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!member) return { error: NextResponse.json({ error: 'That person is not on your team.' }, { status: 404 }) } as const;

  return { auth, workspaceId, userId, phone: typeof body?.phone === 'string' ? body.phone : '' } as const;
}

export async function POST(request: NextRequest) {
  try {
    const target = await resolveTarget(request);
    if ('error' in target) return target.error;

    const inviter = (await loadProfilesByIds(target.auth.adminClient, [target.auth.user.id])).get(target.auth.user.id);
    const result = await addContactAndInvite(target.auth.adminClient, {
      workspaceId: target.workspaceId,
      userId: target.userId,
      phoneRaw: target.phone,
      inviterName: (inviter?.name || '').trim().split(/\s+/)[0] || 'Your team lead',
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, status: result.contact.status, sent: result.sent, warning: result.warning ?? null });
  } catch (error) {
    console.error('[whatsapp] contact POST failed:', error);
    return NextResponse.json({ error: 'Could not save that number.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const target = await resolveTarget(request);
    if ('error' in target) return target.error;
    await removeContact(target.auth.adminClient, target.workspaceId, target.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[whatsapp] contact DELETE failed:', error);
    return NextResponse.json({ error: 'Could not remove that number.' }, { status: 500 });
  }
}
