import type { Metadata } from 'next';
import ClaimsAdminPageClient from './ClaimsAdminPageClient';

export const metadata: Metadata = {
  title: 'Claims',
};

export default function ClaimsAdminPage() {
  return <ClaimsAdminPageClient />;
}
