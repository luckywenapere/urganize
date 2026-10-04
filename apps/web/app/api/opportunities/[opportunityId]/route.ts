import { NextRequest, NextResponse } from 'next/server';
import { parseOpportunityPatch } from '@/lib/opportunities';
import { removeOpportunity, updateOpportunity } from '@/lib/opportunities-server';
import { isUuid, resolveOpportunitiesContext } from '../_shared';

// One opportunity. Every query is scoped to the caller's own team, so another
// team's opportunity and one that does not exist both answer 404.

type RouteContext = { params: Promise<{ opportunityId: string }> };

const NOT_FOUND = { error: 'Opportunity not found.' };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const resolved = await resolveOpportunitiesContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const { opportunityId } = await params;
  if (!isUuid(opportunityId)) return NextResponse.json(NOT_FOUND, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const parsed = parseOpportunityPatch(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await updateOpportunity(adminClient, workspaceId, opportunityId, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ opportunity: result.opportunity });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const resolved = await resolveOpportunitiesContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const { opportunityId } = await params;
  if (!isUuid(opportunityId)) return NextResponse.json(NOT_FOUND, { status: 404 });

  const result = await removeOpportunity(adminClient, workspaceId, opportunityId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
