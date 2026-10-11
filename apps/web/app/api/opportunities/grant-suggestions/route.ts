import { NextRequest, NextResponse } from 'next/server';
import { grantSuggestionsEnabled } from '@/lib/grants/grant-suggestions-flag';
import { listGrantSuggestions } from '@/lib/grants/suggestions-server';
import { resolveOpportunitiesContext } from '../_shared';

// The team's new grant suggestions, made by the weekly run in the notifications
// cron. Behind NEXT_PUBLIC_FEATURE_GRANT_SUGGESTIONS.

export async function GET(request: NextRequest) {
  if (!grantSuggestionsEnabled()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const resolved = await resolveOpportunitiesContext(request, { write: false });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const result = await listGrantSuggestions(adminClient, workspaceId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ suggestions: result.suggestions });
}
