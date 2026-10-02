import type { Metadata } from 'next';
import CreditsPageClient from './CreditsPageClient';

// Thin server wrapper for the tab title, the press kit page's shape.
export const metadata: Metadata = {
  title: 'UrgAns credits',
};

export default function CreditsPage() {
  return <CreditsPageClient />;
}
