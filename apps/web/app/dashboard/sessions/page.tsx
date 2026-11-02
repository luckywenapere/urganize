import type { Metadata } from 'next';
import SessionsPageClient from './SessionsPageClient';

// Thin server wrapper so the tab gets a real title through the root layout's
// '%s | Urganize' template. The page itself is a client component.
export const metadata: Metadata = {
  title: 'Sessions',
};

export default function SessionsPage() {
  return <SessionsPageClient />;
}
