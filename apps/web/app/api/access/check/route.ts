import { NextRequest, NextResponse } from 'next/server';
import { createAccessAdminClient, isEmailLetIn } from '@/lib/access-gate-server';
import { normalizeAccessEmail } from '@/lib/access-gate';

// Closed sign-up (2026-10-15). Signed out, no login: may this email start an
// account? /auth and /onboarding ask before walking someone through the wizard,
// so an invite-less visitor reads "Urganize is invite-only for now" first
// instead of after five steps.
//
// A courtesy screen, not the gate: the gate is server-side after sign-up
// (requireActiveAccount, ensureOwnedWorkspace). So it fails OPEN on any read
// error, and its answer is a single boolean, the same thing /auth already
// reveals about whether an account exists.

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const email = normalizeAccessEmail(body.email);
  if (!email) {
    return NextResponse.json({ error: 'Enter your email address.' }, { status: 400 });
  }

  const admin = createAccessAdminClient();
  if (!admin) return NextResponse.json({ allowed: true, blocked: false });

  const allowed = await isEmailLetIn(admin, email);
  return NextResponse.json(
    { allowed, blocked: !allowed },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
