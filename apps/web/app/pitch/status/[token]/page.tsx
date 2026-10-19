import type { Metadata } from 'next';
import { FrontDeskStatusPage } from './FrontDeskStatusPage';

export const metadata: Metadata = { title: 'Pitch status', robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FrontDeskStatusPage token={token} />;
}
