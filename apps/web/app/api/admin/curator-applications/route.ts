import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/app/api/admin/_shared';
import {
  createAdminClient,
  flagOffResponse,
  isPitchingFeatureEnabled,
} from '@/app/api/curator/_shared';
import { buildCuratorJoinUrl } from '@/lib/tasks-server';
import {
  CURATOR_APPLICATION_STATUSES,
  type CuratorApplicationCounts,
} from '@/lib/curator-applications';
import {
  CURATOR_APPLICATIONS_TABLE,
  CURATOR_APPLICATION_COLUMNS,
  toCuratorApplication,
} from '@/lib/curator-applications-server';

// GET /api/admin/curator-applications — every application, newest first, with
// the count for each status and, for approved ones, the invite link the
// approve minted (so the admin can copy it again for WhatsApp).
//
// Guarded by verifyAdmin (ADMIN_EMAILS) and the pitching flag, like
// /api/admin/curator-invites next to it.

const LIST_LIMIT = 300;

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const client = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!client) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const head = { count: 'exact' as const, head: true };
  const [list, ...countResults] = await Promise.all([
    client
      .from(CURATOR_APPLICATIONS_TABLE)
      .select(CURATOR_APPLICATION_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT),
    ...CURATOR_APPLICATION_STATUSES.map((status) =>
      client.from(CURATOR_APPLICATIONS_TABLE).select('id', head).eq('status', status)
    ),
  ]);

  if (list.error) {
    return NextResponse.json(
      { error: list.error.message || 'Could not load the applications.' },
      { status: 500 }
    );
  }

  const rows = (list.data || []) as unknown as Array<Record<string, unknown>>;

  const inviteIds = Array.from(new Set(rows.map((row) => String(row.invite_id || '')).filter(Boolean)));
  const inviteUrlById = new Map<string, string>();
  if (inviteIds.length) {
    const { data: invites } = await client.from('curator_invites').select('id,code').in('id', inviteIds);
    for (const invite of (invites || []) as Array<Record<string, unknown>>) {
      inviteUrlById.set(String(invite.id), buildCuratorJoinUrl(String(invite.code || '')));
    }
  }

  const counts = CURATOR_APPLICATION_STATUSES.reduce((acc, status, index) => {
    acc[status] = countResults[index]?.count ?? 0;
    return acc;
  }, {} as CuratorApplicationCounts);

  return NextResponse.json(
    { applications: rows.map((row) => toCuratorApplication(row, inviteUrlById)), counts },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
