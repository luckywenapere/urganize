import type { Metadata } from 'next';
import SettingsRedirect from './SettingsRedirect';

// Kept only as a redirect stub: Settings is a pop-up now (see SettingsRedirect).
// The title still applies for the one paint before the hop.
export const metadata: Metadata = {
  title: 'Settings',
};

export default function SettingsPage() {
  return <SettingsRedirect />;
}
