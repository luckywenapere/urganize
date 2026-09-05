import type { Metadata } from 'next';
import PressKitsPageClient from './PressKitsPageClient';

// Thin server wrapper so this route gets a real browser-tab title through the
// root layout's '%s | Urganize' template — the page itself is a client
// component and cannot export metadata.
export const metadata: Metadata = {
  title: 'Press kits',
};

export default function PressKitsPage() {
  return <PressKitsPageClient />;
}
