import type { Metadata } from 'next';
import { CuratorJoinPageClient } from './CuratorJoinPageClient';

export const metadata: Metadata = {
  title: 'Join as a playlist owner',
  // An invite link is private. Keep it out of search results even though the
  // code itself is unguessable.
  robots: { index: false, follow: false },
};

export default function CuratorJoinPage() {
  return <CuratorJoinPageClient />;
}
