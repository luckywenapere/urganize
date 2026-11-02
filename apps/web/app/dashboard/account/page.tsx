import type { Metadata } from 'next';
import AccountPageClient from './AccountPageClient';

// The phone's Settings page (Nov 2, 2026). The swipe shell draws it itself as
// the fourth page of the row; this route is its address.
export const metadata: Metadata = {
  title: 'Settings',
};

export default function AccountPage() {
  return <AccountPageClient />;
}
