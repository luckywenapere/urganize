import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isOpportunitiesEnabled } from '@/lib/paused-features';
import OpportunitiesPageClient from './OpportunitiesPageClient';

// Thin server wrapper so the tab gets a real title through the root layout's
// '%s | Urganize' template. The page itself is a client component.
export const metadata: Metadata = {
  title: 'Opportunities',
};

export default function OpportunitiesPage() {
  // Paused Oct 27, 2026 (lib/paused-features.ts): an old link lands on Home.
  if (!isOpportunitiesEnabled()) redirect('/dashboard/home');
  return <OpportunitiesPageClient />;
}
