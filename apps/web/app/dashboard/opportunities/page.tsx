import type { Metadata } from 'next';
import OpportunitiesPageClient from './OpportunitiesPageClient';

// Thin server wrapper so the tab gets a real title through the root layout's
// '%s | Urganize' template. The page itself is a client component.
export const metadata: Metadata = {
  title: 'Opportunities',
};

export default function OpportunitiesPage() {
  return <OpportunitiesPageClient />;
}
