import type { Metadata } from 'next';
import ReferralsAdminPageClient from './ReferralsAdminPageClient';

export const metadata: Metadata = {
  title: 'Referrals',
};

export default function ReferralsAdminPage() {
  return <ReferralsAdminPageClient />;
}
