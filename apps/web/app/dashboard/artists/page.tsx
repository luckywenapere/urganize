import type { Metadata } from 'next';
import ArtistsPageClient from './ArtistsPageClient';

// Thin server wrapper so the tab gets a real title through the root layout's
// '%s | Urganize' template. The page itself is a client component.
export const metadata: Metadata = {
  title: 'Artists',
};

export default function ArtistsPage() {
  return <ArtistsPageClient />;
}
