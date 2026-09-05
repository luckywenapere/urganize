import type { Metadata } from 'next';
import PressKitPageClient from './PressKitPageClient';

// Thin server wrapper for the tab title, the same shape as the shows detail
// route. The artist's name cannot go in it: this page is a client component
// and the name is not known until the kit loads.
export const metadata: Metadata = {
  title: 'Press kit',
};

export default function PressKitPage() {
  return <PressKitPageClient />;
}
