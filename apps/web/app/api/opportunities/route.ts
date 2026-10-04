import { NextRequest, NextResponse } from 'next/server';
import { parseOpportunityCreate } from '@/lib/opportunities';
import { createOpportunity, listOpportunities } from '@/lib/opportunities-server';
import { resolveOpportunitiesContext } from './_shared';

// The team's opportunities: deals, grants, sync, brands and partnerships typed
// in by hand and tracked to a result.

export async function GET(request: NextRequest) {
  const resolved = await resolveOpportunitiesContext(request, { write: false });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const result = await listOpportunities(adminClient, workspaceId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ opportunities: result.opportunities });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveOpportunitiesContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId, userId } = resolved.context;

  const body = await request.json().catch(() => ({}));
  const parsed = parseOpportunityCreate(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await createOpportunity(adminClient, { workspaceId, actorUserId: userId, data: parsed.value });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ opportunity: result.opportunity }, { status: 201 });
}
