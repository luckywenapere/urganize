import type { Metadata } from 'next';
import GrowthAdminPageClient from './GrowthAdminPageClient';

export const metadata: Metadata = {
  title: 'Growth',
};

export default function GrowthAdminPage() {
  return <GrowthAdminPageClient />;
}
