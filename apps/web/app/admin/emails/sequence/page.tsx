import type { Metadata } from 'next';
import SequencePageClient from './SequencePageClient';

export const metadata: Metadata = {
  title: 'Onboarding emails',
};

export default function SequencePage() {
  return <SequencePageClient />;
}
