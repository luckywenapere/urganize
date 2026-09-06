import type { Metadata } from 'next';
import DirectoryAdminPageClient from './DirectoryAdminPageClient';

export const metadata: Metadata = {
  title: 'Directory',
};

export default function DirectoryAdminPage() {
  return <DirectoryAdminPageClient />;
}
