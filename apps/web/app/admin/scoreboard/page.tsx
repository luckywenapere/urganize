import type { Metadata } from 'next';
import ScoreboardAdminPageClient from './ScoreboardAdminPageClient';

export const metadata: Metadata = {
  title: 'Scoreboard',
};

export default function ScoreboardAdminPage() {
  return <ScoreboardAdminPageClient />;
}
