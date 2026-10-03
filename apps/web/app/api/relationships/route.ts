import { NextRequest, NextResponse } from 'next/server';
import { parseRelationshipCreate } from '@/lib/relationships';
import { listRelationships, seedRelationship } from '@/lib/relationships-server';
import { resolveRelationshipsContext } from './_shared';

// The team's contacts.
//
// GET lists them. POST adds one, finding the person first: an email or phone
// Urganize already knows lands on the existing profile, otherwise a new
// UNCLAIMED, PRIVATE profile is made. See lib/relationships-server.ts.

export async function GET(request: NextRequest) {
  const resolved = await resolveRelationshipsContext(request, { write: false });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const result = await listRelationships(adminClient, workspaceId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ relationships: result.relationships });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveRelationshipsContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId, userId } = resolved.context;

  const body = await request.json().catch(() => ({}));
  const parsed = parseRelationshipCreate(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await seedRelationship(adminClient, {
    workspaceId,
    actorUserId: userId,
    data: parsed.value,
    source: 'manual',
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(
    {
      personId: result.personId,
      created: result.created,
      alreadyKnown: result.matchedVia !== null,
      flagged: result.flagged,
    },
    { status: result.created ? 201 : 200 }
  );
}
