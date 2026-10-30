import type { Metadata } from 'next';
import ArtistsPageClient from './ArtistsPageClient';

// The artist list lives at /dashboard since Oct 30, 2026 (founder: no "artists"
// in the address), and every link in the app goes there. This old address
// still shows the list rather than redirecting, because Android apps built
// before the move send Back here and leave the app only from this exact
// address (SHELL_HOME_PATH in packages/native-bridge). A redirect would trap
// them. /dashboard/artists/<id> does redirect (next.config.js).
export const metadata: Metadata = {
  title: 'Artists',
};

export default function ArtistsPage() {
  return <ArtistsPageClient />;
}
