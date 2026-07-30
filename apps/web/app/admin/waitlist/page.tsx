import type { Metadata } from 'next';
import WaitlistAdminPageClient from './WaitlistAdminPageClient';

export const metadata: Metadata = {
  title: 'Waitlist',
};

export default function WaitlistAdminPage() {
  return <WaitlistAdminPageClient />;
}
