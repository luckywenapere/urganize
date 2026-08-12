import type { Metadata } from 'next';
import { CuratorPlaylistsPageClient } from './CuratorPlaylistsPageClient';

export const metadata: Metadata = {
  title: 'Your playlists',
  robots: { index: false, follow: false },
};

export default function CuratorPlaylistsPage() {
  return <CuratorPlaylistsPageClient />;
}
