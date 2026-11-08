import { NextRequest, NextResponse } from 'next/server';
import { ADDON_PRICES_NAIRA, canBuyAddon } from '@urganize/pricing';
import { getEntitlement } from '@/lib/entitlements';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { addonExtras, addonIsLive, isAddonReference, parseAddonRequest } from '@/lib/addons';
import {
  cancelAddon,
  keepAddon,
  loadBillingTeam,
  loadSavedCard,
  loadTeamAddons,
  resumePausedAddons,
  settleAddonCheckout,
  startAddonCheckout,
} from '@/lib/addons-server';
import { artistKeyFor } from '@/lib/distribution-limits';

/**
 * Add-ons (#1112, mocks docs/mocks/pricing-addons). GET: what the team has and
 * can add. POST { action }: checkout (open Paystack for the first period),
 * verify (settle it on the way back; the webhook settles it too), cancel (stops
 * at the period end), keep (undo a cancel), resume (pay for paused add-ons now).
 *
 * An open route, not behind the paywall: a team whose add-ons are paused must
 * still reach the button that pays for them. Every buy re-checks the plan here.
 */

export const dynamic = 'force-dynamic';

function appBase(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || new URL(request.url).origin).replace(/\/$/, '');
}

/** Only our own pages, so the callback cannot be pointed elsewhere. */
function safeReturn(value: unknown): string {
  const path = typeof value === 'string' ? value.trim() : '';
  return path.startsWith('/dashboard') && !path.startsWith('//') ? path : '/dashboard?settings=billing';
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  const team = await loadBillingTeam(admin, { id: auth.user.id, email: auth.user.email ?? null });
  if (!team) return NextResponse.json({ error: 'You are not on a team yet.' }, { status: 404 });

  const now = new Date();
  const [rows, artists, card] = await Promise.all([
    admin
      .from('team_addons')
      .select('id, kind, quantity, interval, artist_key, artist_name, unit_price_kobo, status, current_period_end, cancel_at_period_end, created_at')
      .eq('workspace_id', team.workspaceId)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: true }),
    admin.from('artists').select('id, name').eq('workspace_id', team.workspaceId).order('name', { ascending: true }),
    team.canBuy ? loadSavedCard(admin, team.workspaceId, team.ownerEmail) : Promise.resolve(null),
  ]);
  const addons = await loadTeamAddons(admin, team.workspaceId);
  const extras = addons ? addonExtras(addons, now) : { seats: 0, artists: 0 };
  const list = ((rows.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    quantity: Number(row.quantity) || 1,
    interval: row.interval === 'yearly' ? 'yearly' : 'monthly',
    artistKey: typeof row.artist_key === 'string' ? row.artist_key : null,
    artistName: typeof row.artist_name === 'string' ? row.artist_name : null,
    priceKobo: (Number(row.unit_price_kobo) || 0) * (Number(row.quantity) || 1),
    status: String(row.status),
    live: addonIsLive(
      {
        status: row.status as 'active',
        currentPeriodEnd: typeof row.current_period_end === 'string' ? row.current_period_end : null,
        cancelAtPeriodEnd: row.cancel_at_period_end === true,
      },
      now
    ),
    renewsAt: typeof row.current_period_end === 'string' ? row.current_period_end : null,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
  }));
  const distributed = new Set(list.filter((row) => row.kind === 'distribution' && row.status === 'active').map((row) => row.artistKey));
  const tier = team.tier;
  const baseSeats = tier ? getEntitlement(tier, 'seats') : null;
  const baseArtists = tier ? getEntitlement(tier, 'artists') : null;

  return NextResponse.json({
    tier,
    paying: team.paying,
    canBuy: team.canBuy,
    card: card ? card.label : null,
    can: {
      person: canBuyAddon(tier, 'person'),
      artist: canBuyAddon(tier, 'artist'),
      distribution: canBuyAddon(tier, 'distribution'),
    },
    prices: ADDON_PRICES_NAIRA,
    limits: {
      seats: typeof baseSeats === 'number' ? { base: baseSeats, extra: extras.seats } : null,
      artists: typeof baseArtists === 'number' ? { base: baseArtists, extra: extras.artists } : null,
    },
    addons: list,
    artists: ((artists.data ?? []) as Array<{ id: string; name: string }>).map((artist) => ({
      id: artist.id,
      name: artist.name,
      hasDistribution: distributed.has(artistKeyFor(artist.id, artist.name)),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  const user = { id: auth.user.id, email: auth.user.email ?? null };
  const team = await loadBillingTeam(admin, user);
  if (!team) return NextResponse.json({ error: 'You are not on a team yet.' }, { status: 404 });
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  switch (body.action) {
    case 'checkout': {
      const parsed = parseAddonRequest(body);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const started = await startAddonCheckout(admin, {
        team,
        user,
        request: parsed.request,
        artistId: typeof body.artistId === 'string' ? body.artistId : null,
        callbackUrl: `${appBase(request)}${safeReturn(body.returnTo)}`,
      });
      return started.ok
        ? NextResponse.json({ ok: true, authorizationUrl: started.authorizationUrl, reference: started.reference })
        : NextResponse.json({ error: started.error }, { status: started.status });
    }
    case 'verify': {
      const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
      if (!isAddonReference(reference)) return NextResponse.json({ error: 'That payment reference is not one of ours.' }, { status: 400 });
      const outcome = await settleAddonCheckout(admin, reference, 'callback');
      if (outcome.state === 'paid') return NextResponse.json({ ok: true, state: 'paid', kind: outcome.kind });
      if (outcome.state === 'error') return NextResponse.json({ ok: true, state: outcome.transient ? 'pending' : 'error' });
      return NextResponse.json({ ok: true, state: outcome.state === 'mismatch' ? 'needs_review' : 'not_paid' });
    }
    case 'cancel':
    case 'keep': {
      const id = typeof body.addonId === 'string' ? body.addonId : '';
      if (!id) return NextResponse.json({ error: 'Pick an add-on.' }, { status: 400 });
      const result = body.action === 'cancel' ? await cancelAddon(admin, team, id, user.id) : await keepAddon(admin, team, id);
      return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 409 });
    }
    case 'resume': {
      const result = await resumePausedAddons(admin, team);
      return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 402 });
    }
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
}
