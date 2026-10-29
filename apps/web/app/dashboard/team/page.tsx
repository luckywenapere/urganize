import type { Metadata } from 'next';
import TeamPageClient from './TeamPageClient';

// Thin server wrapper so the tab gets a real title through the root layout's
// '%s | Urganize' template. The page itself is a client component.
export const metadata: Metadata = {
  title: 'Team',
};

export default function TeamPage() {
  return <TeamPageClient />;
}
