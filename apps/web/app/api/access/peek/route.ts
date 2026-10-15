import { NextRequest, NextResponse } from 'next/server';
import { createAccessAdminClient, peekAccessCode } from '@/lib/access-gate-server';

// Closed sign-up (2026-10-15). What /start/<code> shows before sign-in: is the
// link still good? Reads one row by the code's hash and touches no account.
// GET /api/access/peek?code=<code> → { state: open | used | expired | revoked | invalid }

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code') || '';
  const admin = createAccessAdminClient();
  if (!admin) return NextResponse.json({ state: 'open' });
  const state = await peekAccessCode(admin, code);
  return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } });
}
