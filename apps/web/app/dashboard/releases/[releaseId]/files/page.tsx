import type { Metadata } from 'next';
import FilesPageClient from './FilesPageClient';

// Thin server wrapper, same pattern as the release detail and calendar
// pages: the real page is a client component (Zustand + browser fetches)
// and can't export metadata itself.
export const metadata: Metadata = {
  title: 'Files',
};

export default function FilesPage() {
  return <FilesPageClient />;
}
