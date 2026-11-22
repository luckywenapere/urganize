import type { Metadata } from 'next';
import { CollectionScreen } from '@/components/music/CollectionScreen';

export const metadata: Metadata = { title: 'Collection' };

export default function MusicCollectionPage() {
  return <CollectionScreen />;
}
