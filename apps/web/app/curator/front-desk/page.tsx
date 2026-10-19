import type { Metadata } from 'next';
import { FrontDeskTeachPage } from './FrontDeskTeachPage';

export const metadata: Metadata = { title: 'Teach UrgAns', robots: { index: false, follow: false } };

export default function Page() {
  return <FrontDeskTeachPage />;
}
