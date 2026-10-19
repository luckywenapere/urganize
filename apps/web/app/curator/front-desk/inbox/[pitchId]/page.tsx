import type { Metadata } from 'next';
import { FrontDeskPitchPage } from './FrontDeskPitchPage';

export const metadata: Metadata = { title: 'Question', robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ pitchId: string }> }) {
  const { pitchId } = await params;
  return <FrontDeskPitchPage pitchId={pitchId} />;
}
