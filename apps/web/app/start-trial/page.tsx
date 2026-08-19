import type { Metadata } from 'next';
import StartTrialPageClient from './StartTrialPageClient';

// Thin server wrapper (the app/locked/page.tsx pattern): exists so the route
// can export metadata while the real page stays a client component.
export const metadata: Metadata = {
  title: 'Start your free trial',
};

export default function StartTrialPage() {
  return <StartTrialPageClient />;
}
