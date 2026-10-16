import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ShowPageClient from './ShowPageClient';

export const metadata: Metadata = {
  title: 'Show',
};

// Shows are cut (Oct 16, 2026 brief, URG-319). The show is kept; an old link
// lands on the Catalogue.
const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';

export default function ShowPage() {
  if (!EVENTS_ENABLED) redirect('/dashboard');
  return <ShowPageClient />;
}
