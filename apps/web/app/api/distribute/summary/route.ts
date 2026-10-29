import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { decideReleaseAccess } from '@/lib/release-access';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { SMART_LINKS_TABLE } from '@/lib/altlink/server';
import { isAltlinkEnabled, normalizeIsrc, normalizeUpc } from '@/lib/altlink/rules';
import { linkChip, storesChip, type DistributeRow, type SmartLinkRowFacts } from '@/lib/distribute-summary';

// The two tags on each Distribute row (Oct 29, 2026, #850): stores, and the
// smart link. One read for the whole list, from stored rows and cached numbers
// only: lists never call Altlink (BUILD-NOTES-ALTLINK.md, stats rule).
//
// GET ?ids=a,b,c (the rollouts the list already shows). Each id goes through
// the same team-aware decision as every scene route (lib/release-access.ts);
// one the caller cannot read is left out, never an error.
//
// The smart link tag shows only once a link exists or could: a UPC or ISRC
// (from Metadata or the distributor's submission) and a release date. Altlink
// asked for that on the Oct 28 call (#852). The rollout page reads this route
// for one id to decide whether to show its Smart link and Numbers tabs.

export const dynamic = 'force-dynamic';

const MAX_IDS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const ids = [...new Set((request.nextUrl.searchParams.get('ids') ?? '').split(',').map((id) => id.trim()))]
    .filter((id) => UUID.test(id))
    .slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ rows: {} });

  try {
    const releases = await admin
      .from('releases')
      .select('id,owner_user_id,artist_id,release_date,deleted_at')
      .in('id', ids);
    if (releases.error) throw new Error(releases.error.message);

    const list = (releases.data ?? []) as Array<Record<string, unknown>>;
    // Membership is read once, and only when some rollout is not the caller's own.
    const needsContext = list.some((row) => String(row.owner_user_id ?? '') !== auth.user.id);
    const access = needsContext ? await loadWorkspaceAccessContext(admin, auth.user) : null;
    const readable = list.filter((row) => {
      if (row.deleted_at) return false;
      const owner = String(row.owner_user_id ?? '');
      if (owner && owner === auth.user.id) return true;
      if (!access) return false;
      return (
        decideReleaseAccess({
          releaseOwnerId: owner,
          releaseArtistId: String(row.artist_id ?? ''),
          releaseId: String(row.id ?? ''),
          userId: auth.user.id,
          access,
          write: false,
        }) !== 'not_found'
      );
    });
    const readableIds = readable.map((row) => String(row.id));
    if (readableIds.length === 0) return NextResponse.json({ rows: {} });

    const [links, submissions, metadata] = await Promise.all([
      isAltlinkEnabled()
        ? admin.from(SMART_LINKS_TABLE).select('release_id,status,url,presave_signups,stats').in('release_id', readableIds)
        : Promise.resolve({ data: [], error: null }),
      admin.from('distribution_submissions').select('release_id,status,updated_at,upc,isrc').in('release_id', readableIds),
      admin.from('release_metadata').select('release_id,upc,isrc').in('release_id', readableIds),
    ]);
    if (links.error) throw new Error(links.error.message);
    if (submissions.error) throw new Error(submissions.error.message);
    if (metadata.error) throw new Error(metadata.error.message);

    const withCode = new Set<string>();
    for (const row of [...(submissions.data ?? []), ...(metadata.data ?? [])] as Array<{ release_id: string; upc: unknown; isrc: unknown }>) {
      if (normalizeUpc(row.upc) || normalizeIsrc(row.isrc)) withCode.add(row.release_id);
    }

    const linkBy = new Map<string, SmartLinkRowFacts>();
    for (const row of (links.data ?? []) as Array<SmartLinkRowFacts & { release_id: string }>) linkBy.set(row.release_id, row);
    // The latest submission per rollout decides its stores tag.
    const storesBy = new Map<string, { status: string; updated_at: string }>();
    for (const row of (submissions.data ?? []) as Array<{ release_id: string; status: string; updated_at: string }>) {
      const seen = storesBy.get(row.release_id);
      if (!seen || row.updated_at > seen.updated_at) storesBy.set(row.release_id, row);
    }

    const now = Date.now();
    const rows: Record<string, DistributeRow> = {};
    for (const row of readable) {
      const id = String(row.id);
      rows[id] = {
        stores: storesChip(storesBy.get(id)?.status ?? null),
        link: linkChip(linkBy.get(id) ?? null, row.release_date ? String(row.release_date) : null, now, withCode.has(id)),
      };
    }
    return NextResponse.json({ rows, altlink: isAltlinkEnabled() });
  } catch (error) {
    console.error('[distribute] summary failed', { message: error instanceof Error ? error.message : 'error' });
    return NextResponse.json({ error: 'Could not load Distribute.' }, { status: 500 });
  }
}
