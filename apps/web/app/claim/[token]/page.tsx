import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { ClaimWizard } from '@/components/people/ClaimWizard';
import { isValidClaimToken } from '@/lib/claim';
import { loadClaimPreview } from '@/lib/claim-server';

// A claim link, opened by somebody a team credited. Server component, no auth:
// the person may have no account yet. The token is the only access control and
// the page shows only a name, a masked contact hint and the credits. Every
// failure (a bad link, a removed page, a database blip) reads the same.
//
// noindex: this is a private link, not a page to find.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Claim your page',
  robots: { index: false, follow: false },
};

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let preview: Awaited<ReturnType<typeof loadClaimPreview>> = { ok: false, reason: 'unavailable' };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (isValidClaimToken(token) && url && key) {
    preview = await loadClaimPreview(createClient(url, key, { auth: { persistSession: false } }), token);
  }

  return <ClaimWizard token={token} preview={preview} />;
}
