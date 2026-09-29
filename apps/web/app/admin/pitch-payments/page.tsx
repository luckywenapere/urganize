import type { Metadata } from 'next';
import PitchPaymentsAdminPageClient from './PitchPaymentsAdminPageClient';

export const metadata: Metadata = {
  title: 'Pitch payments',
};

export default function PitchPaymentsAdminPage() {
  return <PitchPaymentsAdminPageClient />;
}
