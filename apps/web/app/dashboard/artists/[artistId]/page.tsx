import type { Metadata } from 'next';
import ArtistPageClient from './ArtistPageClient';

// The artist's name is not known until the roster loads, so the title is the
// generic one, the same call the shows and press kit detail routes make.
export const metadata: Metadata = {
  title: 'Artist',
};

export default function ArtistPage() {
  return <ArtistPageClient />;
}
