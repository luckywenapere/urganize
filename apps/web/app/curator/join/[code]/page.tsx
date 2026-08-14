import type { Metadata } from 'next';
import { loadCuratorInviteState } from '@/lib/curator-invite-server';
import { CuratorJoinPageClient } from './CuratorJoinPageClient';

export const metadata: Metadata = {
  title: 'Join as a playlist owner',
  // An invite link is private. Keep it out of search results even though the
  // code itself is unguessable.
  robots: { index: false, follow: false },
};

// The invite's standing is read from the database here rather than from a client
// effect, so the HTML this page serves already contains either the real sign-up
// form or the real "link not available" message. That is the whole point: an
// invited curator on weak mobile data used to get a loading skeleton and nothing
// else until ~1MB of JS had arrived and hydrated. See lib/curator-invite-server.ts.
//
// force-dynamic because the answer depends on a database row that changes
// (single-use, revocable, expiring) — there is no static version of this page to
// preserve, unlike /auth, where force-dynamic was deliberately REJECTED to keep
// its CDN cache hit.
export const dynamic = 'force-dynamic';

export default async function CuratorJoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const lookup = await loadCuratorInviteState(code);

  return <CuratorJoinPageClient initialLookup={lookup} />;
}
