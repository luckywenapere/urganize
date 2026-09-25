import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { DEVICE_PUSH_TOKENS_TABLE } from '@/lib/fcm-server';

// Registers/removes this device's native push token (an FCM token on both
// platforms, from the native shell). Sibling to /api/push/subscribe, which
// does the same job for Web Push subscriptions — kept as a separate route
// because the two rows shapes don't overlap (a token has no p256dh/auth
// keypair). One row per token; re-registering the same device upserts, and
// a device that switches accounts rebinds its token to the new user.

const MAX_TOKEN_LENGTH = 4096;

type TokenBody = {
  token?: unknown;
  platform?: unknown;
};

const trimString = (value: unknown): string => String(value || '').trim();

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as TokenBody;
  const token = trimString(body.token);
  const platform = trimString(body.platform);

  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return NextResponse.json({ error: 'Invalid push token.' }, { status: 400 });
  }
  if (platform !== 'android' && platform !== 'ios') {
    return NextResponse.json({ error: 'Invalid platform.' }, { status: 400 });
  }

  const { error } = await auth.adminClient.from(DEVICE_PUSH_TOKENS_TABLE).upsert(
    {
      user_id: auth.user.id,
      token,
      platform,
    },
    { onConflict: 'token' }
  );

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save the push token.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as TokenBody;
  const token = trimString(body.token);
  if (!token) {
    return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
  }

  // Scoped to the caller's own rows — one user can't unregister another's
  // device even if they somehow learned its token.
  const { error } = await auth.adminClient
    .from(DEVICE_PUSH_TOKENS_TABLE)
    .delete()
    .eq('token', token)
    .eq('user_id', auth.user.id);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not remove the push token.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
