import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { getTrmCapabilities, getTrmToken, trmConfigured } from '@/lib/trm/client';
import { isInternalAccountEmail } from '@/lib/internal-accounts';

// Read-only TRM connection check (URG-392), for the team's own accounts only:
// exchanges the partner credentials for a token and reads /capabilities (which
// may list TRM's store ids). Never writes to TRM. Everyone else gets 404.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  if (!isInternalAccountEmail(auth.user.email ?? '')) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!trmConfigured()) return NextResponse.json({ configured: false });
  try {
    await getTrmToken();
    const capabilities = await getTrmCapabilities();
    return NextResponse.json({ configured: true, token: 'ok', capabilities });
  } catch (error) {
    return NextResponse.json({ configured: true, token: 'failed', error: error instanceof Error ? error.message : 'unknown' }, { status: 502 });
  }
}
