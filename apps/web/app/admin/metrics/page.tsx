import type { Metadata } from 'next';
import MetricsAdminPageClient from './MetricsAdminPageClient';

export const metadata: Metadata = {
  title: 'Metrics',
};

export default function MetricsAdminPage() {
  return <MetricsAdminPageClient />;
}
