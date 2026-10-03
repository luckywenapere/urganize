import { NextRequest, NextResponse } from 'next/server';
import { parseRelationshipPatch } from '@/lib/relationships';
import { getRelationship, removeRelationship, updateRelationship } from '@/lib/relationships-server';
import { isUuid, resolveRelationshipsContext } from '../_shared';

// One contact. Every query is scoped to the caller's own team, so another
// team's contact and one that does not exist both answer 404.

type RouteContext = { params: Promise<{ personId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const resolved = await resolveRelationshipsContext(request, { write: false });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const { personId } = await params;
  if (!isUuid(personId)) return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });

  const result = await getRelationship(adminClient, workspaceId, personId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ relationship: result.relationship });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const resolved = await resolveRelationshipsContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const { personId } = await params;
  if (!isUuid(personId)) return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = parseRelationshipPatch(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await updateRelationship(adminClient, workspaceId, personId, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ relationship: result.relationship });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const resolved = await resolveRelationshipsContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const { personId } = await params;
  if (!isUuid(personId)) return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });

  const result = await removeRelationship(adminClient, workspaceId, personId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
