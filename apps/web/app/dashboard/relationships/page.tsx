import type { Metadata } from 'next';
import RelationshipsPageClient from './RelationshipsPageClient';

// Thin server wrapper so the tab gets a real title through the root layout's
// '%s | Urganize' template. The page itself is a client component.
export const metadata: Metadata = {
  title: 'Relationships',
};

export default function RelationshipsPage() {
  return <RelationshipsPageClient />;
}
