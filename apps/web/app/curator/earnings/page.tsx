import type { Metadata } from 'next';
import { CuratorEarningsPageClient } from './CuratorEarningsPageClient';

export const metadata: Metadata = {
  title: 'Earnings',
  robots: { index: false, follow: false },
};

export default function CuratorEarningsPage() {
  return <CuratorEarningsPageClient />;
}
