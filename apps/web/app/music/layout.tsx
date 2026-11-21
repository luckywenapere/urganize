import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MusicShell } from '@/components/music/MusicShell';

export const metadata: Metadata = {
  title: 'Music',
  description: 'Listen to new music from artists on Urganize.',
};

// One shell for the whole music side. Next keeps this layout mounted while a
// listener moves between Songs, You and Search, so the song that is playing
// keeps playing through every tab change.
export default function MusicLayout({ children }: { children: ReactNode }) {
  return <MusicShell>{children}</MusicShell>;
}
