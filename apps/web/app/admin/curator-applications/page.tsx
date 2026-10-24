import type { Metadata } from 'next';
import CuratorApplicationsAdminPageClient from './CuratorApplicationsAdminPageClient';

export const metadata: Metadata = {
  title: 'Applications',
};

export default function CuratorApplicationsAdminPage() {
  return <CuratorApplicationsAdminPageClient />;
}
