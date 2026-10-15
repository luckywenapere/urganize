import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ShowsPageClient from './ShowsPageClient';

// Thin server wrapper so this route gets a real browser-tab title through the
// root layout's '%s | Urganize' template — the page itself is a client
// component and cannot export metadata.
export const metadata: Metadata = {
  title: 'Shows',
};

// Shows live on each artist's page (URG-303, founder 2026-10-15), so the old
// all-shows list sends people to Artists. A show's own page still opens. With
// the artist page off, the list stays as it was.
const ARTIST_PAGE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_ARTIST_PAGE === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export default function ShowsPage() {
  if (ARTIST_PAGE_ENABLED) redirect('/dashboard/artists');
  return <ShowsPageClient />;
}
