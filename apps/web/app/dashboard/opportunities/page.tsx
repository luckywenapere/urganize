import type { Metadata } from 'next';
import { ComingSoon } from '@/components/shell/ComingSoon';

export const metadata: Metadata = {
  title: 'Opportunities',
};

export default function OpportunitiesPage() {
  return <ComingSoon area="opportunities" />;
}
