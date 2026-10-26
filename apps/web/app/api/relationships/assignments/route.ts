import { NextRequest, NextResponse } from 'next/server';
import { isVouchesFlagOn } from '@/lib/vouches';
import { listAssignments } from '@/lib/vouches-server';
import { notFoundResponse, resolveRelationshipsContext } from '../_shared';

// Vouch, slice 1: which of the team's activities have a person from My People
// on them ("Who's doing it"). The task store reads this so marking one of
// them done can ask "How was {first name} on this?". Scoped to the caller's
// own team; empty until the relationships migration adds the column.

export async function GET(request: NextRequest) {
  if (!isVouchesFlagOn()) return notFoundResponse();
  const resolved = await resolveRelationshipsContext(request, { write: false });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const assignments = await listAssignments(adminClient, workspaceId);
  return NextResponse.json({ assignments });
}
