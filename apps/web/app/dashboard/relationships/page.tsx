import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isRelationshipsFlagOn } from '@/lib/paused-features';
import RelationshipsPageClient from './RelationshipsPageClient';

// Thin server wrapper so the tab gets a real title through the root layout's
// '%s | Urganize' template. The page itself is a client component.
export const metadata: Metadata = {
  title: 'Relationships',
};

export default function RelationshipsPage() {
  // Paused Oct 27, 2026 (lib/paused-features.ts): an old link lands on Home.
  if (!isRelationshipsFlagOn()) redirect('/dashboard');
  return <RelationshipsPageClient />;
}
