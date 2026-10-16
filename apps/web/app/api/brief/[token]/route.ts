import { NextResponse } from 'next/server';
import { loadPublicBrief } from '@/lib/release-brief-server';

// The view link's data, for anyone holding the token (no account). The page at
// /brief/[token] reads the same loader server-side; this route exists for any
// other reader of the link. Never cached: the link can be switched off.
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const brief = await loadPublicBrief(token);
  if (!brief) {
    return NextResponse.json({ error: 'This link isn’t available.' }, { status: 404 });
  }
  return NextResponse.json(
    { brief },
    { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } }
  );
}
