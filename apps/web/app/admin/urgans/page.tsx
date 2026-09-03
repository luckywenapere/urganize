import type { Metadata } from 'next';
import UrgansAdminPageClient from './UrgansAdminPageClient';

export const metadata: Metadata = {
  title: 'UrgAns actions',
};

export default function UrgansAdminPage() {
  return <UrgansAdminPageClient />;
}
