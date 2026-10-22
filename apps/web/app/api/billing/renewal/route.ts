import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/releases/_shared';
import { daysUntil, isCheckoutPeriod, isCheckoutPlan } from '@/lib/self-serve';

// Self-serve checkout (2026-10-22): is this owner's bank-transfer period ending
// within 7 days? Drives the "Manager ends in 3 days. Renew" strip. A card
// renews by itself, so card teams never get it. Open route (a team in its last
// days must still be told), owner only, and every failure answers "not due".

const NOT_DUE = { due: false } as const;

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return NextResponse.json(NOT_DUE);
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json(NOT_DUE);
  try {
    const team = await admin.from('workspaces').select('payment_method').eq('owner_id', auth.user.id).maybeSingle();
    const method = (team.data as { payment_method: string | null } | null)?.payment_method;
    if (team.error || (method !== 'transfer' && method !== 'direct_transfer')) return NextResponse.json(NOT_DUE);
    const sub = await admin
      .from('subscriptions')
      .select('plan,billing_interval,status,expires_at')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    const row = sub.data as { plan: string | null; billing_interval: string | null; status: string | null; expires_at: string | null } | null;
    if (sub.error || !row || row.status !== 'active' || !isCheckoutPlan(row.plan)) return NextResponse.json(NOT_DUE);
    const daysLeft = daysUntil(row.expires_at, new Date());
    if (daysLeft === null || daysLeft < 1 || daysLeft > 7) return NextResponse.json(NOT_DUE);
    return NextResponse.json({
      due: true,
      plan: row.plan,
      period: isCheckoutPeriod(row.billing_interval) ? row.billing_interval : 'monthly',
      daysLeft,
    });
  } catch {
    return NextResponse.json(NOT_DUE);
  }
}
