import type { Metadata } from 'next';
import MetadataPageClient from './MetadataPageClient';

// Thin server wrapper, same pattern as the release detail, calendar, files,
// and press kit pages: the real page is a client component (Zustand +
// browser fetches) and can't export metadata itself.
export const metadata: Metadata = {
  title: 'Metadata',
};

export default function MetadataPage() {
  return <MetadataPageClient />;
}
