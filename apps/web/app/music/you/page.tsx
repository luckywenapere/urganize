import type { Metadata } from 'next';
import { YouScreen } from '@/components/music/YouScreen';

export const metadata: Metadata = { title: 'You' };

export default function MusicYouPage() {
  return <YouScreen />;
}
