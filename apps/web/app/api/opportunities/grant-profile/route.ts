import { NextRequest, NextResponse } from 'next/server';
import { parseGrantProfile } from '@/lib/grants/grant-profile';
import { loadGrantProfile, saveGrantProfile } from '@/lib/grants/grant-profile-server';
import { grantSuggestionsEnabled } from '@/lib/grants/grant-suggestions-flag';
import { resolveOpportunitiesContext } from '../_shared';

// The team's grant profile: where it is based, its stage, who applies, and what
// it needs. Suggested grants match on it. Behind NEXT_PUBLIC_FEATURE_GRANT_SUGGESTIONS.

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

export async function GET(request: NextRequest) {
  if (!grantSuggestionsEnabled()) return notFound();
  const resolved = await resolveOpportunitiesContext(request, { write: false });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;

  const result = await loadGrantProfile(adminClient, workspaceId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ profile: result.profile, saved: result.saved });
}

export async function PUT(request: NextRequest) {
  if (!grantSuggestionsEnabled()) return notFound();
  const resolved = await resolveOpportunitiesContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId, userId } = resolved.context;

  const body = await request.json().catch(() => null);
  const parsed = parseGrantProfile(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await saveGrantProfile(adminClient, { workspaceId, actorUserId: userId, profile: parsed.value });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ profile: result.profile, saved: true });
}
