import type { Metadata } from 'next';
import { readInitialInvite } from '@/lib/invite-metadata-server';
import InviteAcceptPageClient from './InviteAcceptPageClient';

export const metadata: Metadata = {
  title: 'Team invite',
  // An invite link is private. Keep it out of search results.
  robots: { index: false, follow: false },
};

// The invite is read here, on the server, so the HTML a phone gets on weak data
// already holds the real invite (or the real "not available"), not "Loading
// invite". Mirrors the curator join page's fix. force-dynamic because the
// answer depends on a row that changes (single use, revoked, expiring).
export const dynamic = 'force-dynamic';

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: rawToken } = await searchParams;
  const token = (Array.isArray(rawToken) ? rawToken[0] : rawToken || '').trim();
  const initialLoad = await readInitialInvite(token);
  return <InviteAcceptPageClient token={token} initialLoad={initialLoad} />;
}
