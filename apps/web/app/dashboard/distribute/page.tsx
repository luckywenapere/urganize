import type { Metadata } from 'next';
import DistributePageClient from './DistributePageClient';

// Thin server wrapper so the tab gets a real title through the root layout's
// '%s | Urganize' template. The page itself is a client component.
export const metadata: Metadata = {
  title: 'Distribute',
};

export default function DistributePage() {
  return <DistributePageClient />;
}
