import type { Metadata } from 'next';
import EmailsAdminPageClient from './EmailsAdminPageClient';

export const metadata: Metadata = {
  title: 'Emails',
};

export default function EmailsAdminPage() {
  return <EmailsAdminPageClient />;
}
