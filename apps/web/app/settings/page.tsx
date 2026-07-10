import type { Metadata } from 'next';
import SettingsPageClient from './SettingsPageClient';

// Thin server wrapper so this route gets a real browser-tab title through the
// root layout's '%s | Urganize' template — the page itself is a client
// component and cannot export metadata.
export const metadata: Metadata = {
  title: 'Settings',
};

export default function SettingsPage() {
  return <SettingsPageClient />;
}
