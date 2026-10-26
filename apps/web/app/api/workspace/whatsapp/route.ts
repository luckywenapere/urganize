import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext, loadWorkspaceMembers } from '@/lib/tasks-server';
import { isByoProvider, isSafeBaseUrl } from '@/lib/whatsapp/byo-ai';
import { maskPhone } from '@/lib/whatsapp/phone';
import { encryptSecret, isKeyStorageConfigured } from '@/lib/whatsapp/secret';
import { isWhatsappConfigured } from '@/lib/whatsapp/transport';
import { listContacts, loadSettings, saveSettings, type SettingsPatch } from '@/lib/whatsapp/server';

// WhatsApp chasing settings for the caller's team. Anyone on the team can read
// them (so a teammate sees whether they are being chased); only owners and
// admins can change them. The team's own AI key is write-only: it goes in
// encrypted and only ever comes back as "a key is stored".

type Access = Awaited<ReturnType<typeof loadWorkspaceAccessContext>>;

function canManage(access: Access, workspaceId: string): boolean {
  const role = access.memberships.find((m) => m.workspaceId === workspaceId)?.role;
  return role === 'owner' || role === 'admin';
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
    const workspaceId = access.primaryWorkspaceId;
    if (!workspaceId) return NextResponse.json({ error: 'No team found.' }, { status: 404 });

    const [settings, contacts, members] = await Promise.all([
      loadSettings(auth.adminClient, workspaceId),
      listContacts(auth.adminClient, workspaceId),
      loadWorkspaceMembers(auth.adminClient, workspaceId, auth.user.id),
    ]);
    const contactByUser = new Map(contacts.map((c) => [c.userId, c]));

    return NextResponse.json({
      canEdit: canManage(access, workspaceId),
      serverReady: isWhatsappConfigured(),
      keyStorageReady: isKeyStorageConfigured(),
      settings,
      people: members
        .filter((m) => m.userId && m.status === 'active')
        .map((m) => {
          const contact = contactByUser.get(m.userId as string);
          return {
            userId: m.userId as string,
            name: m.name || m.email,
            isCurrentUser: m.isCurrentUser,
            phoneMasked: contact ? maskPhone(contact.phone) : null,
            status: contact?.status ?? 'none',
          };
        }),
    });
  } catch (error) {
    console.error('[whatsapp] GET failed:', error);
    return NextResponse.json({ error: 'Could not load WhatsApp settings.' }, { status: 500 });
  }
}

const BOOLEAN_FIELDS = ['enabled', 'chaseDayBefore', 'chaseDueDay', 'chaseOverdue', 'tellOwnerOnDelay'] as const;

export async function PATCH(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send the settings as JSON.' }, { status: 400 });
  }

  const patch: SettingsPatch = {};
  for (const field of BOOLEAN_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'boolean') return NextResponse.json({ error: `${field} must be true or false.` }, { status: 400 });
    patch[field] = body[field] as boolean;
  }
  if (body.overdueEveryDays !== undefined) {
    const n = Number(body.overdueEveryDays);
    if (!Number.isInteger(n) || n < 1 || n > 14) {
      return NextResponse.json({ error: 'Chase every 1 to 14 days.' }, { status: 400 });
    }
    patch.overdueEveryDays = n;
  }
  if (body.aiMode !== undefined) {
    if (body.aiMode !== 'urganize' && body.aiMode !== 'own') {
      return NextResponse.json({ error: 'Unknown AI choice.' }, { status: 400 });
    }
    patch.aiMode = body.aiMode;
  }
  if (body.aiProvider !== undefined) {
    if (body.aiProvider !== null && !isByoProvider(body.aiProvider)) {
      return NextResponse.json({ error: 'Unknown AI provider.' }, { status: 400 });
    }
    patch.aiProvider = body.aiProvider as SettingsPatch['aiProvider'];
  }
  if (body.aiBaseUrl !== undefined) {
    const value = typeof body.aiBaseUrl === 'string' ? body.aiBaseUrl.trim().replace(/\/+$/, '') : null;
    if (value && !isSafeBaseUrl(value)) {
      return NextResponse.json({ error: 'The AI address must be a public https address.' }, { status: 400 });
    }
    patch.aiBaseUrl = value || null;
  }
  if (body.aiModel !== undefined) {
    const value = typeof body.aiModel === 'string' ? body.aiModel.trim() : '';
    if (value.length > 120) return NextResponse.json({ error: 'That model name is too long.' }, { status: 400 });
    patch.aiModel = value || null;
  }
  if (body.aiKey !== undefined) {
    if (body.aiKey === null || body.aiKey === '') {
      patch.aiKeyEncrypted = null;
    } else if (typeof body.aiKey !== 'string' || body.aiKey.length > 500) {
      return NextResponse.json({ error: 'That key does not look right.' }, { status: 400 });
    } else {
      if (!isKeyStorageConfigured()) {
        return NextResponse.json({ error: 'Saving your own key is not switched on for this server yet.' }, { status: 503 });
      }
      patch.aiKeyEncrypted = encryptSecret(body.aiKey.trim());
    }
  }

  try {
    const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
    const workspaceId = access.primaryWorkspaceId;
    if (!workspaceId) return NextResponse.json({ error: 'No team found.' }, { status: 404 });
    if (!canManage(access, workspaceId)) {
      return NextResponse.json({ error: 'Only owners and admins can change this.' }, { status: 403 });
    }

    // Choosing "bring your own" with nothing to call would silently fall back to
    // Urganize AI on every reply, so say so up front instead.
    const current = await loadSettings(auth.adminClient, workspaceId);
    const nextMode = patch.aiMode ?? current.aiMode;
    const nextHasKey = patch.aiKeyEncrypted === undefined ? current.hasKey : patch.aiKeyEncrypted !== null;
    const nextModel = patch.aiModel === undefined ? current.aiModel : patch.aiModel;
    const nextProvider = patch.aiProvider === undefined ? current.aiProvider : patch.aiProvider;
    if (nextMode === 'own' && (!nextHasKey || !nextModel || !nextProvider)) {
      return NextResponse.json({ error: 'Add a provider, a model, and a key first.' }, { status: 400 });
    }

    const saved = await saveSettings(auth.adminClient, workspaceId, auth.user.id, patch);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 });
    return NextResponse.json({ settings: await loadSettings(auth.adminClient, workspaceId) });
  } catch (error) {
    console.error('[whatsapp] PATCH failed:', error);
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }
}
