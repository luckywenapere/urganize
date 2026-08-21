import type { Metadata } from 'next';
import TeamsAdminPageClient from './TeamsAdminPageClient';

export const metadata: Metadata = {
  title: 'Teams',
};

export default function TeamsAdminPage() {
  return <TeamsAdminPageClient />;
}
