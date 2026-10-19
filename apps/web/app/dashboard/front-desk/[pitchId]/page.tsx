import type { Metadata } from 'next';
import { FrontDeskAskPage } from './FrontDeskAskPage';

export const metadata: Metadata = { title: 'Ask about this pitch', robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ pitchId: string }> }) {
  const { pitchId } = await params;
  return <FrontDeskAskPage pitchId={pitchId} />;
}
