import type { Metadata } from 'next';
import FeaturedAdminPageClient from './FeaturedAdminPageClient';

export const metadata: Metadata = {
  title: 'Featured',
};

export default function FeaturedAdminPage() {
  return <FeaturedAdminPageClient />;
}
