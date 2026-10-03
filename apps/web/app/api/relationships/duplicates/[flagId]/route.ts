import { NextRequest, NextResponse } from 'next/server';
import { dismissDuplicateFlag } from '@/lib/relationships-server';
import { isUuid, resolveRelationshipsContext } from '../../_shared';

// "These are different people." The pair stops being suggested for this team.
// There is deliberately no merge here: joining two profiles is its own
// confirmed action, not a side effect of a suggestion.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ flagId: string }> }
) {
  const resolved = await resolveRelationshipsContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId, userId } = resolved.context;

  const { flagId } = await params;
  if (!isUuid(flagId)) return NextResponse.json({ error: 'Suggestion not found.' }, { status: 404 });

  const result = await dismissDuplicateFlag(adminClient, workspaceId, flagId, userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
