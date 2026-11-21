import type { Metadata } from 'next';
import { SearchScreen } from '@/components/music/SearchScreen';

export const metadata: Metadata = { title: 'Search music' };

export default function MusicSearchPage() {
  return <SearchScreen />;
}
