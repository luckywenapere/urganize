import type { Metadata } from 'next';
import SourceLinksAdminPageClient from './SourceLinksAdminPageClient';

export const metadata: Metadata = { title: 'Short links' };

export default function SourceLinksAdminPage() {
  return <SourceLinksAdminPageClient />;
}
