import type { Metadata } from 'next';
import SeedingAdminPageClient from './SeedingAdminPageClient';

export const metadata: Metadata = {
  title: 'Seeding',
};

export default function SeedingAdminPage() {
  return <SeedingAdminPageClient />;
}
