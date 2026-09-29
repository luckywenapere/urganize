import type { Metadata } from 'next';
import PitchPaidPageClient from './PitchPaidPageClient';

// Where Paystack sends an artist after paying for a pitch. Thin server wrapper
// for the tab title, the pattern every page here follows.
export const metadata: Metadata = {
  title: 'Pitch payment',
};

export default function PitchPaidPage() {
  return <PitchPaidPageClient />;
}
