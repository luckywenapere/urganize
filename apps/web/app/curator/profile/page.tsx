import type { Metadata } from 'next';
import { CuratorProfilePageClient } from './CuratorProfilePageClient';

export const metadata: Metadata = {
  title: 'Your profile',
  robots: { index: false, follow: false },
};

export default function CuratorProfilePage() {
  return <CuratorProfilePageClient />;
}
