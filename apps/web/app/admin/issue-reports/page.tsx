import type { Metadata } from 'next';
import IssueReportsAdminPageClient from './IssueReportsAdminPageClient';

export const metadata: Metadata = {
  title: 'Reports',
};

export default function IssueReportsAdminPage() {
  return <IssueReportsAdminPageClient />;
}
