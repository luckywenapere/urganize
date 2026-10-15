import { NextRequest, NextResponse } from 'next/server';
import { parseInteraction } from '@/lib/relationships';
import { logInteraction } from '@/lib/relationships-server';
import { isUuid, resolveRelationshipsContext } from '../../_shared';

// Log on a person's page (My People, URG-306): one line about what happened,
// which also moves their last contact to now. Scoped to the caller's own team,
// so another team's person and one that does not exist both answer 404.

type RouteContext = { params: Promise<{ personId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const resolved = await resolveRelationshipsContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId, userId } = resolved.context;

  const { personId } = await params;
  if (!isUuid(personId)) return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = parseInteraction(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await logInteraction(adminClient, {
    workspaceId,
    personId,
    actorUserId: userId,
    body: parsed.value.body,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ interaction: result.interaction, lastContactAt: result.lastContactAt }, { status: 201 });
}
