import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/releases/_shared';
import { isCheckoutPeriod, isCheckoutPlan } from '@/lib/self-serve';
import { isBachsConfigured } from '@/lib/bachs';
import { fulfilBachsCheckout, loadBachsCheckout, startBachsCheckout } from '@/lib/bachs-server';
import { CALL_REQUIRED_ERROR } from '@/lib/call-led';
import { mayPay } from '@/lib/call-led-server';

// Pay through Bachs (2026-11-01, #946).
//
// POST { plan, period }
//   Opens a Bachs checkout for one month or one year and returns its URL. The
//   payer picks how to pay on Bachs's page (Naira card or transfer, mobile
//   money, dollar card, crypto).
// GET ?reference=
//   What the return page polls. Asks Bachs too, so a payer who comes back
//   before the webhook still gets in, and only if Bachs says it is paid.
//
// OPEN route: the payer is walled until this succeeds.

export const dynamic = 'force-dynamic';

function appUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return configured || new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  if (!isBachsConfigured()) return NextResponse.json({ error: 'This way to pay is not on yet.' }, { status: 503 });
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const userId = auth.user.id;
  const email = String(auth.user.email || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'No email on your account.' }, { status: 400 });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  let body: { plan?: unknown; period?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (!isCheckoutPlan(body.plan)) return NextResponse.json({ error: 'Pick a plan.' }, { status: 400 });
  if (!isCheckoutPeriod(body.period)) return NextResponse.json({ error: 'Pick how long to pay for.' }, { status: 400 });
  const plan = body.plan;
  const period = body.period;
  if (!(await mayPay(admin, { userId, email, plan, period }))) {
    return NextResponse.json({ error: CALL_REQUIRED_ERROR, code: 'call_required' }, { status: 403 });
  }

  const workspace = await admin.from('workspaces').select('id').eq('owner_id', userId).maybeSingle();
  const workspaceId = (workspace.data as { id: string } | null)?.id ?? null;
  const meta = (auth.user.user_metadata as Record<string, unknown> | null) ?? {};
  const name = String(meta.full_name || meta.name || '').trim() || null;

  const started = await startBachsCheckout(admin, {
    userId,
    email,
    name,
    workspaceId,
    plan,
    period,
    appUrl: appUrl(request),
  });
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: 502 });
  return NextResponse.json({ checkoutUrl: started.checkoutUrl, reference: started.reference });
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const reference = new URL(request.url).searchParams.get('reference')?.trim() || '';
  if (!reference) return NextResponse.json({ error: 'Missing reference.' }, { status: 400 });
  const row = await loadBachsCheckout(admin, reference);
  if (!row || row.user_id !== auth.user.id) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const facts = { plan: row.plan, period: row.billing_interval };
  if (row.status === 'paid') return NextResponse.json({ status: 'paid', periodEnd: row.period_end, ...facts });

  const result = isBachsConfigured() ? await fulfilBachsCheckout(admin, reference) : 'not_paid';
  if (result === 'applied' || result === 'already') {
    const fresh = await loadBachsCheckout(admin, reference);
    return NextResponse.json({ status: 'paid', periodEnd: fresh?.period_end ?? null, ...facts });
  }
  return NextResponse.json({ status: 'waiting', ...facts });
}
