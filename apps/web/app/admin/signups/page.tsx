import type { Metadata } from 'next';
import SignupsAdminPageClient from './SignupsAdminPageClient';

export const metadata: Metadata = {
  title: 'Signups',
};

export default function SignupsAdminPage() {
  return <SignupsAdminPageClient />;
}
