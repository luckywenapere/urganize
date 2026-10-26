import { NextRequest, NextResponse } from 'next/server';
import { isVouchesFlagOn, parseAssignment } from '@/lib/vouches';
import { assignPerson } from '@/lib/vouches-server';
import { isUuid, notFoundResponse, resolveRelationshipsContext } from '../../_shared';

// Vouch, slice 1: "Who's doing it" on one activity. Body { personId } with one
// of the team's people, or null for nobody. The activity and the person are
// both checked against the caller's own team; another team's activity and one
// that does not exist both answer 404.

type RouteContext = { params: Promise<{ taskId: string }> };

export async function PUT(request: NextRequest, { params }: RouteContext) {
  if (!isVouchesFlagOn()) return notFoundResponse();
  const resolved = await resolveRelationshipsContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const { taskId } = await params;
  if (!isUuid(taskId)) return NextResponse.json({ error: 'Activity not found.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = parseAssignment(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await assignPerson(adminClient, { workspaceId, taskId, personId: parsed.value.personId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ taskId, personId: result.personId });
}
