import type { Metadata } from 'next';
import AddCardPageClient from './AddCardPageClient';

// Thin server wrapper (the app/locked/page.tsx pattern) so the route can carry
// a title while the page itself stays a client component.
export const metadata: Metadata = {
  title: 'Start your free days',
};

export default function AddCardPage() {
  return <AddCardPageClient />;
}
