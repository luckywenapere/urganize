import { NextRequest, NextResponse } from 'next/server';
import { listDuplicateFlags } from '@/lib/relationships-server';
import { resolveRelationshipsContext } from '../_shared';

// Pairs of the team's own contacts that look alike, for a person to confirm or
// dismiss. Nothing is ever merged on its own.

export async function GET(request: NextRequest) {
  const resolved = await resolveRelationshipsContext(request, { write: false });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const result = await listDuplicateFlags(adminClient, workspaceId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ flags: result.flags });
}
