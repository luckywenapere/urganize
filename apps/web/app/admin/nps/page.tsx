import type { Metadata } from 'next';
import NpsAdminPageClient from './NpsAdminPageClient';

export const metadata: Metadata = { title: 'NPS' };

export default function NpsAdminPage() {
  return <NpsAdminPageClient />;
}
