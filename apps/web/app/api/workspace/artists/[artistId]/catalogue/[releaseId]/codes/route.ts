import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAdmin, loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { CATALOGUE_TABLE } from '@/lib/artist-import/server';
import { parseTypedCode } from '@/lib/artist-import/codes';

// Saves a UPC or an ISRC typed by hand, for a release the music service had no
// code for. Body: { code }. Which kind it is comes from its shape.
export async function PATCH(request: NextRequest, context: { params: Promise<{ artistId: string; releaseId: string }> }) {
  const auth = await requireAuthenticatedAdmin(request);
  if ('error' in auth) return auth.error;
  const { releaseId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(releaseId)) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const parsed = parseTypedCode(body?.code);
  if (!parsed) {
    return NextResponse.json({ error: 'Enter a UPC (12 or 13 digits) or an ISRC (like USQX92602558).' }, { status: 400 });
  }

  const access = await loadWorkspaceAccessContext(auth.adminClient, auth.user);
  if (access.workspaceIds.length === 0) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
  const patch: Record<string, string> = { codes_checked_at: new Date().toISOString() };
  if (parsed.upc) patch.upc = parsed.upc;
  if (parsed.isrc) patch.isrc = parsed.isrc;
  const { data, error } = await auth.adminClient
    .from(CATALOGUE_TABLE)
    .update(patch)
    .eq('id', releaseId)
    .in('workspace_id', access.workspaceIds)
    .select('id,upc,isrc')
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
  return NextResponse.json({ release: data });
}
