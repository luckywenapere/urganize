import type { Metadata } from 'next';
import NotesPageClient from './NotesPageClient';

// Thin server wrapper so this route gets a real browser-tab title through the
// root layout's '%s | Urganize' template — the page itself is a client
// component and cannot export metadata.
export const metadata: Metadata = {
  title: 'Notes',
};

export default function NotesPage() {
  return <NotesPageClient />;
}
