import type { Metadata } from 'next';
import SelfServeAdminPageClient from './SelfServeAdminPageClient';

export const metadata: Metadata = { title: 'Self-serve' };

export default function SelfServeAdminPage() {
  return <SelfServeAdminPageClient />;
}
