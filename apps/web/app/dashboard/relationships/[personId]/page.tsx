import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isRelationshipsFlagOn } from '@/lib/paused-features';
import RelationshipPageClient from './RelationshipPageClient';

export const metadata: Metadata = {
  title: 'Contact',
};

export default function RelationshipPage() {
  // Paused Oct 27, 2026 (lib/paused-features.ts): an old link lands on Home.
  if (!isRelationshipsFlagOn()) redirect('/dashboard/artists');
  return <RelationshipPageClient />;
}
