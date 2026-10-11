import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import { recordClaimOpened } from '@/lib/seeding-server';

// The page loaded in a real browser. Recorded once, and always answers 204 so
// the page never shows an error over a bookkeeping call. Open (no login): the
// person has no account yet.

export async function POST(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const client = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (client) {
    try {
      await recordClaimOpened(client, token);
    } catch (error) {
      console.warn('[welcome] could not record an open', error);
    }
  }
  return new NextResponse(null, { status: 204 });
}
