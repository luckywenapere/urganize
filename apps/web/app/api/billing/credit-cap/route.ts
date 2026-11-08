import { NextRequest, NextResponse } from 'next/server';
import { CREDIT_OVERAGE_NAIRA } from '@urganize/pricing';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { isCardCheckReference } from '@/lib/addons';
import { loadBillingTeam, loadSavedCard, settleCardCheck, startCardCheck } from '@/lib/addons-server';
import { cardLoader } from '@/lib/billing-run-server';
import { getCreditSnapshot } from '@/lib/credits/credits-server';
import { parseCapNaira } from '@/lib/credits/overage';
import { chargeEndedOverage, readCreditCap, writeCreditCap } from '@/lib/credits/overage-server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';

/**
 * AI credits past the plan's monthly credits (#1112, mocks docs/mocks/pricing-addons).
 * GET: the rate, the cap, this window's use and the saved card. PUT { capNaira }:
 * set the monthly cap (owner or admin; a cap above ₦0 needs a card on file).
 * POST { action }: card_checkout (₦100 card check, refunded), card_verify, and
 * pay_now (charge unpaid past windows to the saved card).
 */

export const dynamic = 'force-dynamic';

function appBase(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || new URL(request.url).origin).replace(/\/$/, '');
}

async function context(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return { error: auth.error } as const;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) } as const;
  const user = { id: auth.user.id, email: auth.user.email ?? null };
  const team = await loadBillingTeam(admin, user);
  if (!team) return { error: NextResponse.json({ error: 'You are not on a team yet.' }, { status: 404 }) } as const;
  return { admin, user, team } as const;
}

export async function GET(request: NextRequest) {
  const ctx = await context(request);
  if ('error' in ctx) return ctx.error;
  const { admin, user, team } = ctx;
  const access = await getTeamAccessForUser(user.id, user.email);
  const [snapshot, card, capKobo, unpaid] = await Promise.all([
    getCreditSnapshot(admin, { workspaceId: team.workspaceId, ownerUserId: team.ownerUserId, team: access }),
    team.canBuy ? loadSavedCard(admin, team.workspaceId, team.ownerEmail) : Promise.resolve(null),
    readCreditCap(admin, team.workspaceId),
    admin.from('credit_overage').select('credits, rate_kobo').eq('workspace_id', team.workspaceId).eq('status', 'failed'),
  ]);
  const unpaidKobo = ((unpaid.data ?? []) as Array<{ credits: number; rate_kobo: number }>).reduce(
    (total, row) => total + (Number(row.credits) || 0) * (Number(row.rate_kobo) || 0),
    0
  );
  return NextResponse.json({
    eligible: Boolean(snapshot?.overage),
    canEdit: team.canBuy,
    tier: team.tier,
    rateNaira: team.tier ? CREDIT_OVERAGE_NAIRA[team.tier] : null,
    capNaira: Math.round(capKobo / 100),
    allowance: snapshot?.monthlyAllowance ?? 0,
    balance: snapshot ? Math.max(0, Math.floor(snapshot.total)) : null,
    nextGrantAt: snapshot?.nextGrantAt ?? null,
    used: snapshot?.overage ? { credits: snapshot.overage.credits, spentNaira: Math.round(snapshot.overage.spentKobo / 100) } : null,
    card: card ? card.label : null,
    unpaidNaira: Math.round(unpaidKobo / 100),
  });
}

export async function PUT(request: NextRequest) {
  const ctx = await context(request);
  if ('error' in ctx) return ctx.error;
  const { admin, user, team } = ctx;
  if (!team.canBuy) return NextResponse.json({ error: 'Ask the person who runs your team to set the cap.' }, { status: 403 });
  if (!team.paying) return NextResponse.json({ error: 'A cap needs a paid plan.' }, { status: 409 });
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const capNaira = parseCapNaira(body.capNaira);
  if (capNaira === null) return NextResponse.json({ error: 'Type an amount between ₦0 and ₦1,000,000.' }, { status: 400 });
  if (capNaira > 0 && !(await loadSavedCard(admin, team.workspaceId, team.ownerEmail))) {
    return NextResponse.json({ error: 'Add a card first.', needsCard: true }, { status: 409 });
  }
  const saved = await writeCreditCap(admin, { workspaceId: team.workspaceId, capKobo: capNaira * 100, actorUserId: user.id });
  return saved ? NextResponse.json({ ok: true, capNaira }) : NextResponse.json({ error: 'Could not save the cap. Try again.' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const ctx = await context(request);
  if ('error' in ctx) return ctx.error;
  const { admin, user, team } = ctx;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  switch (body.action) {
    case 'card_checkout': {
      const started = await startCardCheck(admin, { team, user, callbackUrl: `${appBase(request)}/dashboard/credits` });
      return started.ok
        ? NextResponse.json({ ok: true, authorizationUrl: started.authorizationUrl })
        : NextResponse.json({ error: started.error }, { status: started.status });
    }
    case 'card_verify': {
      const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
      if (!isCardCheckReference(reference)) return NextResponse.json({ error: 'That payment reference is not one of ours.' }, { status: 400 });
      const result = await settleCardCheck(admin, team, reference);
      return result.ok ? NextResponse.json({ ok: true, card: result.label }) : NextResponse.json({ error: result.error }, { status: 409 });
    }
    case 'pay_now': {
      if (!team.canBuy) return NextResponse.json({ error: 'Ask the person who runs your team to pay.' }, { status: 403 });
      const summary = await chargeEndedOverage(admin, cardLoader(admin), new Date(), { workspaceId: team.workspaceId });
      return summary.failed > 0
        ? NextResponse.json({ error: 'Your card was not charged. Add another card and try again.' }, { status: 402 })
        : NextResponse.json({ ok: true, charged: summary.charged });
    }
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}
