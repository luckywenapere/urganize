import type { Metadata } from 'next';
import BroadcastPageClient from './BroadcastPageClient';

export const metadata: Metadata = { title: 'Broadcast' };

export default function BroadcastPage() {
  return <BroadcastPageClient />;
}
