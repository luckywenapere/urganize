import { NextRequest, NextResponse } from 'next/server';
import { grantSuggestionsEnabled } from '@/lib/grants/grant-suggestions-flag';
import { parseSuggestionAction } from '@/lib/grants/suggestions';
import { actOnGrantSuggestion } from '@/lib/grants/suggestions-server';
import { isUuid, resolveOpportunitiesContext } from '../../_shared';

// Add a suggested grant to the team's opportunities, or dismiss it for good.
// Body: { "action": "add" | "dismiss" }.

export async function POST(request: NextRequest, { params }: { params: Promise<{ suggestionId: string }> }) {
  if (!grantSuggestionsEnabled()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const { suggestionId } = await params;
  if (!isUuid(suggestionId)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const resolved = await resolveOpportunitiesContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId, userId } = resolved.context;

  const parsed = parseSuggestionAction(await request.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await actOnGrantSuggestion(adminClient, {
    workspaceId,
    actorUserId: userId,
    suggestionId,
    action: parsed.value,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ opportunity: result.opportunity });
}
