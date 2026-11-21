import type { Metadata } from 'next';
import { SettingsScreen } from '@/components/music/SettingsScreen';

export const metadata: Metadata = { title: 'Music settings' };

export default function MusicSettingsPage() {
  return <SettingsScreen />;
}
