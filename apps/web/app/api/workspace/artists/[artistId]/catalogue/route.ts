import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { CATALOGUE_TABLE } from '@/lib/artist-import/server';

// An artist's imported catalogue, newest first. Read-only.
export async function GET(request: NextRequest, context: { params: Promise<{ artistId: string }> }) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { artistId } = await context.params;

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  if (access.workspaceIds.length === 0) return NextResponse.json({ releases: [] });

  const { data, error } = await auth.adminClient
    .from(CATALOGUE_TABLE)
    .select('id,title,kind,release_date,cover_url,url,source')
    .eq('artist_id', artistId)
    .in('workspace_id', access.workspaceIds)
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) return NextResponse.json({ releases: [] });
  return NextResponse.json({ releases: data ?? [] });
}
