import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/app/api/admin/_shared';
import { buildCuratorJoinUrl } from '@/lib/tasks-server';
import {
  CURATOR_INVITE_TTL_DAYS,
  curatorInviteExpiry,
  generateCuratorInviteCode,
  resolveCuratorInviteState,
} from '@/lib/curator-invites';
import {
  createAdminClient,
  flagOffResponse,
  isPitchingFeatureEnabled,
} from '@/app/api/curator/_shared';
import type { CuratorInvite } from '@/types/pitching';

// Curator invites are minted here and nowhere else. Playlist owners cannot
// sign themselves up: the whole side of the product is invite-only, which is
// what keeps the curator inbox worth opening.
//
// Guarded by verifyAdmin (ADMIN_EMAILS), the same gate as every other
// /api/admin route, and flag-checked first so the routes are dark with the
// feature off.

const INVITES_TABLE = 'curator_invites';
const INVITE_COLUMNS = 'id,code,created_at,expires_at,revoked_at,used_by,used_at';
const LIST_LIMIT = 200;

// verifyAdmin is the gate; the queries run on the shared, properly typed
// service-role client every other route uses. verifyAdmin's own client is built
// without a schema type, so writes through it resolve to `never`.
function resolveAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return supabaseUrl ? createAdminClient(supabaseUrl) : null;
}

const notConfigured = () =>
  NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });


/** Newest first, with the used-by curator's display name resolved. */
export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const adminClient = resolveAdminClient();
  if (!adminClient) return notConfigured();

  const { data, error } = await adminClient
    .from(INVITES_TABLE)
    .select(INVITE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load invites.' },
      { status: 500 }
    );
  }

  const rows = (data || []) as Array<Record<string, unknown>>;

  // One extra query for every curator who has used a link, rather than a join:
  // curator_profiles has no FK relationship PostgREST can traverse from here
  // (both sides point at auth.users), so the embed syntax is unavailable.
  const usedByIds = Array.from(
    new Set(rows.map((row) => String(row.used_by || '')).filter(Boolean))
  );
  const namesById = new Map<string, string>();
  if (usedByIds.length) {
    const { data: profiles } = await adminClient
      .from('curator_profiles')
      .select('user_id,display_name')
      .in('user_id', usedByIds);
    for (const profile of (profiles || []) as Array<Record<string, unknown>>) {
      namesById.set(String(profile.user_id || ''), String(profile.display_name || ''));
    }
  }

  const invites: CuratorInvite[] = rows.map((row) => {
    const code = String(row.code || '');
    return {
      id: String(row.id || ''),
      code,
      url: buildCuratorJoinUrl(code),
      state: resolveCuratorInviteState(row),
      usedByName: namesById.get(String(row.used_by || '')) || null,
      createdAt: String(row.created_at || ''),
      expiresAt: row.expires_at ? String(row.expires_at) : null,
      usedAt: row.used_at ? String(row.used_at) : null,
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    };
  });

  return NextResponse.json({ invites, ttlDays: CURATOR_INVITE_TTL_DAYS });
}

/** Mints one single-use link. */
export async function POST(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const requestedDays =
    payload.expiresInDays === undefined || payload.expiresInDays === null
      ? CURATOR_INVITE_TTL_DAYS
      : Number(payload.expiresInDays);
  if (!Number.isFinite(requestedDays) || requestedDays < 1) {
    return NextResponse.json({ error: 'Expiry must be at least one day.' }, { status: 400 });
  }

  const code = generateCuratorInviteCode();
  const expiresAt = curatorInviteExpiry(requestedDays);

  const adminClient = resolveAdminClient();
  if (!adminClient) return notConfigured();

  const { data, error } = await adminClient
    .from(INVITES_TABLE)
    .insert({ code, created_by: admin.userId, expires_at: expiresAt })
    .select(INVITE_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not create the invite.' },
      { status: 500 }
    );
  }

  const row = data as Record<string, unknown>;
  const invite: CuratorInvite = {
    id: String(row.id || ''),
    code,
    url: buildCuratorJoinUrl(code),
    state: resolveCuratorInviteState(row),
    usedByName: null,
    createdAt: String(row.created_at || ''),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    usedAt: null,
    revokedAt: null,
  };

  return NextResponse.json({ invite }, { status: 201 });
}
