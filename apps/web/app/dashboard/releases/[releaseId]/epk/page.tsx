import type { Metadata } from 'next';
import EpkPageClient from './EpkPageClient';

// Thin server wrapper, same pattern as the release detail, calendar, and
// files pages: the real page is a client component (Zustand + browser
// fetches) and can't export metadata itself.
export const metadata: Metadata = {
  title: 'Press kit',
};

export default function EpkPage() {
  return <EpkPageClient />;
}
