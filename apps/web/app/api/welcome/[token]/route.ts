import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { parseClaimBody } from '@/lib/seeding';
import { claimProfile, openClaimLink } from '@/lib/seeding-server';

// The invited manager's side of a seeding link.
//
// GET is open (no login): it shows the profile Wena built with them and
// records that the link was opened. A link that cannot be used answers with its
// state; one that never existed answers 'missing', the same as a deleted one.
//
// POST needs a signed-in account (getAuthenticatedUser, deliberately NOT the
// paywalled gate: somebody finishing sign up must not be refused by billing).
// It makes the profile theirs and, only if they say so, publishes it.

function resolveAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return supabaseUrl ? createAdminClient(supabaseUrl) : null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const client = resolveAdminClient();
  if (!client) return NextResponse.json({ state: 'missing' });
  const view = await openClaimLink(client, token);
  return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a valid request body.' }, { status: 400 });
  }
  const parsed = parseClaimBody(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const client = resolveAdminClient();
  if (!client) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const { token } = await context.params;
  const result = await claimProfile(client, { token, userId: auth.user.id, body: parsed });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, published: result.published, slug: result.slug });
}
