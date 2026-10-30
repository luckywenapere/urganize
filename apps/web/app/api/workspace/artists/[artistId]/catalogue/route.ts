import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { afterResponse } from '@/lib/after-response';
import { ARTISTS_TABLE } from '@/lib/artists-server';
import { CATALOGUE_TABLE, type StreamingProfile } from '@/lib/artist-import/server';
import { CATALOGUE_LINKS_TABLE, enrichCatalogueCodes, readLinkCap } from '@/lib/artist-import/links-server';

// An artist's imported catalogue, newest first, with each release's codes and
// link and the team's links left for today. Reading it also finishes the
// background code lookup when some releases are still waiting for one.
// `profile` says the artist's older music was brought in (#882, #890).
export async function GET(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { artistId } = await context.params;

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  if (access.workspaceIds.length === 0) {
    return NextResponse.json({ releases: [], cap: null, codesPending: 0, profile: null });
  }

  const artistRow = await auth.adminClient
    .from(ARTISTS_TABLE)
    .select('streaming_source,streaming_source_id,catalogue_synced_at')
    .eq('id', artistId)
    .in('workspace_id', access.workspaceIds)
    .maybeSingle();
  const found = artistRow.data as {
    streaming_source: StreamingProfile['source'] | null;
    streaming_source_id: string | null;
    catalogue_synced_at: string | null;
  } | null;
  const profile: StreamingProfile | null =
    found?.streaming_source && found.streaming_source_id
      ? { source: found.streaming_source, syncedAt: found.catalogue_synced_at }
      : null;

  const { data, error } = await auth.adminClient
    .from(CATALOGUE_TABLE)
    .select('id,workspace_id,title,kind,release_date,cover_url,url,source,upc,isrc,codes_checked_at')
    .eq('artist_id', artistId)
    .in('workspace_id', access.workspaceIds)
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) return NextResponse.json({ releases: [], cap: null, codesPending: 0, profile });

  const rows = (data ?? []) as {
    id: string;
    workspace_id: string;
    source: string;
    codes_checked_at: string | null;
  }[];
  const ids = rows.map((row) => row.id);
  const links = ids.length
    ? await auth.adminClient
        .from(CATALOGUE_LINKS_TABLE)
        .select('catalogue_release_id,status,url')
        .in('catalogue_release_id', ids)
    : { data: [] };
  const linkByRelease = new Map(
    ((links.data ?? []) as { catalogue_release_id: string; status: string; url: string | null }[]).map((link) => [
      link.catalogue_release_id,
      link,
    ])
  );

  const codesPending = rows.filter((row) => row.source === 'deezer' && !row.codes_checked_at).length;
  if (codesPending > 0) {
    afterResponse('catalogue codes', () => enrichCatalogueCodes(auth.adminClient, artistId));
  }

  const cap = rows.length ? await readLinkCap(auth.adminClient, rows[0].workspace_id) : null;
  return NextResponse.json({
    releases: rows.map((row) => {
      const link = linkByRelease.get(row.id);
      return { ...row, link: link?.status === 'made' ? { url: link.url } : null };
    }),
    cap,
    codesPending,
    profile,
  });
}
