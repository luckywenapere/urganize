import { NextRequest, NextResponse } from 'next/server';
import { isVouchesFlagOn, parseVouch } from '@/lib/vouches';
import { getRelationship } from '@/lib/relationships-server';
import { listVouches, listWorkedTogether, saveVouch } from '@/lib/vouches-server';
import { isUuid, notFoundResponse, resolveRelationshipsContext } from '../../_shared';

// Vouch, slice 1, on one person.
//
// GET: "Worked together" (derived from the team's activities with this person
// on them) and the team's own vouches. POST: save a vouch, { skill, note?,
// taskId? }; one per team per skill, a repeat updates it. Private to the
// team. Another team's person and one that does not exist both answer 404.

type RouteContext = { params: Promise<{ personId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!isVouchesFlagOn()) return notFoundResponse();
  const resolved = await resolveRelationshipsContext(request, { write: false });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const { personId } = await params;
  if (!isUuid(personId)) return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });

  // Found first, so another team's person never gets further.
  const found = await getRelationship(adminClient, workspaceId, personId);
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: found.status });

  const [workedTogether, vouches] = await Promise.all([
    listWorkedTogether(adminClient, workspaceId, personId),
    listVouches(adminClient, workspaceId, personId),
  ]);
  return NextResponse.json({ workedTogether, vouches });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isVouchesFlagOn()) return notFoundResponse();
  const resolved = await resolveRelationshipsContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId, userId } = resolved.context;

  const { personId } = await params;
  if (!isUuid(personId)) return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = parseVouch(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await saveVouch(adminClient, {
    workspaceId,
    personId,
    actorUserId: userId,
    vouch: parsed.value,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ vouch: result.vouch }, { status: 201 });
}
