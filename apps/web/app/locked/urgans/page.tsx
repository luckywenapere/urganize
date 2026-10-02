import type { Metadata } from 'next';
import UrgansHubClient from './UrgansHubClient';

// Thin server wrapper so this route gets a real browser-tab title; the page
// itself is a client component and cannot export metadata.
export const metadata: Metadata = {
  title: 'UrgAns credits',
};

export default function UrgansHubPage() {
  return <UrgansHubClient />;
}
