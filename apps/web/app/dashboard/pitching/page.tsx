import type { Metadata } from 'next';
import PitchingPageClient from './PitchingPageClient';

// Thin server wrapper so this route gets a real browser-tab title through the
// root layout's '%s | Urganize' template — the page itself is a client
// component and cannot export metadata.
export const metadata: Metadata = {
  title: 'Pitching',
};

export default function PitchingPage() {
  return <PitchingPageClient />;
}
