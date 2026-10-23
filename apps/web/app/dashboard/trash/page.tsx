import type { Metadata } from 'next';
import TrashPageClient from './TrashPageClient';

// Thin server wrapper for the tab title, same shape as the credits page.
export const metadata: Metadata = {
  title: 'Trash',
};

export default function TrashPage() {
  return <TrashPageClient />;
}
