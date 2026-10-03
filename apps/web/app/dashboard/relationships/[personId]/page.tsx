import type { Metadata } from 'next';
import RelationshipPageClient from './RelationshipPageClient';

export const metadata: Metadata = {
  title: 'Contact',
};

export default function RelationshipPage() {
  return <RelationshipPageClient />;
}
