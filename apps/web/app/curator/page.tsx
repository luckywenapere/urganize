import type { Metadata } from 'next';
import { CuratorInboxPageClient } from './CuratorInboxPageClient';

export const metadata: Metadata = {
  title: 'Pitches',
  robots: { index: false, follow: false },
};

export default function CuratorInboxPage() {
  return <CuratorInboxPageClient />;
}
