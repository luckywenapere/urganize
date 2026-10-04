import type { Metadata } from 'next';
import { ComingSoon } from '@/components/shell/ComingSoon';

export const metadata: Metadata = {
  title: 'Audience',
};

export default function AudiencePage() {
  return <ComingSoon area="audience" />;
}
