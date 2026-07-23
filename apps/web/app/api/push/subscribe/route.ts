import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/app/api/_shared/auth';
import { PUSH_SUBSCRIPTIONS_TABLE } from '@/lib/push-server';

// Registers/removes this device's Web Push subscription. One row per
// endpoint (browser profile); re-subscribing upserts, and a device that
// switches accounts rebinds its endpoint to the new user via the upsert.

type SubscribeBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  userAgent?: unknown;
};

const trimString = (value: unknown): string => String(value || '').trim();

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as SubscribeBody;
  const endpoint = trimString(body.endpoint);
  const p256dh = trimString(body.keys?.p256dh);
  const authKey = trimString(body.keys?.auth);
  const userAgent = trimString(body.userAgent).slice(0, 400) || null;

  if (!endpoint || !endpoint.startsWith('https://') || !p256dh || !authKey) {
    return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 });
  }

  const { error } = await auth.adminClient.from(PUSH_SUBSCRIPTIONS_TABLE).upsert(
    {
      user_id: auth.user.id,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: userAgent,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save the subscription.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as SubscribeBody;
  const endpoint = trimString(body.endpoint);
  if (!endpoint) {
    return NextResponse.json({ error: 'Endpoint is required.' }, { status: 400 });
  }

  // Scoped to the caller's own rows — one user can't unsubscribe another's
  // device even if they somehow learned its endpoint.
  const { error } = await auth.adminClient
    .from(PUSH_SUBSCRIPTIONS_TABLE)
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', auth.user.id);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not remove the subscription.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
