import type { Metadata } from 'next';
import FriendLinkClient from './FriendLinkClient';

// A held account's waitlist share link, go.urganize.app/r/<code>
// (2026-10-23). See lib/waitlist-share.ts.
export const metadata: Metadata = {
  title: "You're invited to join the waitlist",
  robots: { index: false, follow: false },
};

export default async function FriendLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <FriendLinkClient code={code} />;
}
