import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';
import { getTierPriceUsd } from '@urganize/pricing';
import { isBachsConfigured, shouldOfferBachs } from '@/lib/bachs';
import { isCardTrialPeriod } from '@/lib/bachs-trial';
import {
  isCardTrialAvailable,
  loadCardTrialByReference,
  loadCardTrialForUser,
  settleCardTrialCheckout,
  startCardTrialCheckout,
  type CardTrialRow,
} from '@/lib/bachs-trial-server';
import { CHECKOUT_PLANS, isCheckoutPlan } from '@/lib/self-serve';

// Card trial for customers abroad (2026-11-14, #1266).
//
// POST { plan, period }
//   Opens Bachs's card page for a plan that starts with free days. Returns
//   { checkoutUrl }, or { unavailable: true } when Bachs has not turned card
//   trials on for us (the caller then carries on with the trial that needs no
//   card). Only for someone outside Nigeria: Bachs renews dollar cards only.
// GET ?reference=   what the return page polls after the card page.
// GET               this account's card trial, for Settings.
//
// OPEN route (getAuthenticatedUser): it has to answer for an account that has
// not got in yet, and Settings has to show it to a team whose plan lapsed.

export const dynamic = 'force-dynamic';

function appUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
}

function summary(row: CardTrialRow) {
  return {
    status: row.status,
    plan: row.plan,
    period: row.billing_interval,
    amountUsd: row.amount_minor / 100,
    trialEnd: row.trial_end,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  };
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const offered = shouldOfferBachs(isBachsConfigured(), request.headers.get('x-vercel-ip-country'));
  if (!offered || !(await isCardTrialAvailable(admin))) return NextResponse.json({ unavailable: true });

  const email = String(auth.user.email || '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'No email on your account.' }, { status: 400 });

  let body: { plan?: unknown; period?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const plan = body.plan;
  const period = body.period;
  if (!isCheckoutPlan(plan) || !CHECKOUT_PLANS.includes(plan) || !getTierPriceUsd(plan, 'monthly')) {
    return NextResponse.json({ error: 'Pick a plan.' }, { status: 400 });
  }
  if (!isCardTrialPeriod(period)) return NextResponse.json({ error: 'Pick monthly or yearly.' }, { status: 400 });

  const existing = await loadCardTrialForUser(admin, auth.user.id);
  if (existing && existing.status !== 'canceled') {
    return NextResponse.json({ error: 'Your trial has already started.' }, { status: 409 });
  }

  const workspace = await admin.from('workspaces').select('id').eq('owner_id', auth.user.id).maybeSingle();
  const meta = (auth.user.user_metadata as Record<string, unknown> | null) ?? {};
  const started = await startCardTrialCheckout(admin, {
    userId: auth.user.id,
    email,
    name: String(meta.full_name || meta.name || '').trim() || null,
    workspaceId: (workspace.data as { id: string } | null)?.id ?? null,
    plan,
    period,
    appUrl: appUrl(request),
  });
  if (!started.ok) {
    if (started.unavailable) return NextResponse.json({ unavailable: true });
    return NextResponse.json({ error: started.error }, { status: 502 });
  }
  return NextResponse.json({ checkoutUrl: started.checkoutUrl, reference: started.reference });
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });

  const reference = new URL(request.url).searchParams.get('reference')?.trim() || '';
  if (!reference) {
    const row = await loadCardTrialForUser(admin, auth.user.id);
    return NextResponse.json({ trial: row ? summary(row) : null }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const row = await loadCardTrialByReference(admin, reference);
  if (!row || row.user_id !== auth.user.id) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const settled =
    row.subscription_id || !isBachsConfigured() ? row : ((await settleCardTrialCheckout(admin, reference)) ?? row);
  return NextResponse.json({ started: Boolean(settled.subscription_id), trial: summary(settled) });
}
