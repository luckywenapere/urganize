import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/app/api/admin/_shared';
import { createAdminClient, flagOffResponse, isPitchingFeatureEnabled } from '@/app/api/curator/_shared';
import { PITCH_CREDIT_TIERS, isPitchCreditTier, normalizeCreditPrice } from '@/lib/pitch-credits';

/**
 * Playlist tiers for Pitch on credits (URG-345). Urganize, never the curator,
 * puts each playlist in a tier: Free (0), Standard (100) or Top (250) credits a
 * pitch, set from reach. Every playlist starts Free. ADMIN_EMAILS only, the
 * same verifyAdmin gate as every /api/admin route; internal, so not behind the
 * credits flag (only pitching's).
 */

const LIST_LIMIT = 300;

function resolveAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return supabaseUrl ? createAdminClient(supabaseUrl) : null;
}

const UNMIGRATED = 'Run the Pitch on credits migration first (20261017120000_pitch_credits.sql).';

export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const client = resolveAdminClient();
  if (!client) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const { data, error } = await client
    .from('curator_playlists')
    .select('id,name,platform,follower_count,curator_user_id,credit_price')
    .order('follower_count', { ascending: false, nullsFirst: false })
    .limit(LIST_LIMIT);
  if (error) {
    return NextResponse.json({ error: error.code === '42703' ? UNMIGRATED : error.message }, { status: error.code === '42703' ? 409 : 500 });
  }
  const rows = (data || []) as Array<Record<string, unknown>>;
  const ids = Array.from(new Set(rows.map((row) => String(row.curator_user_id || '')).filter(Boolean)));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await client.from('curator_profiles').select('user_id,display_name').in('user_id', ids);
    for (const profile of (profiles || []) as Array<Record<string, unknown>>) {
      names.set(String(profile.user_id || ''), String(profile.display_name || ''));
    }
  }
  return NextResponse.json({
    tiers: PITCH_CREDIT_TIERS,
    playlists: rows.map((row) => ({
      id: String(row.id),
      name: String(row.name || ''),
      platform: String(row.platform || ''),
      followerCount: typeof row.follower_count === 'number' ? row.follower_count : null,
      curatorName: names.get(String(row.curator_user_id || '')) || 'Playlist owner',
      creditPrice: normalizeCreditPrice(row.credit_price),
    })),
  });
}

export async function PATCH(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const client = resolveAdminClient();
  if (!client) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const body = (await request.json().catch(() => null)) as { playlistId?: unknown; creditPrice?: unknown } | null;
  const playlistId = typeof body?.playlistId === 'string' ? body.playlistId : '';
  if (!playlistId || !isPitchCreditTier(body?.creditPrice)) {
    return NextResponse.json({ error: `Pick a playlist and a tier (${PITCH_CREDIT_TIERS.join(', ')}).` }, { status: 400 });
  }
  const { data, error } = await client
    .from('curator_playlists')
    .update({ credit_price: body.creditPrice })
    .eq('id', playlistId)
    .select('id,credit_price')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.code === '42703' ? UNMIGRATED : error.message }, { status: error.code === '42703' ? 409 : 500 });
  }
  if (!data) return NextResponse.json({ error: 'Playlist not found.' }, { status: 404 });
  return NextResponse.json({ id: playlistId, creditPrice: normalizeCreditPrice((data as Record<string, unknown>).credit_price) });
}
