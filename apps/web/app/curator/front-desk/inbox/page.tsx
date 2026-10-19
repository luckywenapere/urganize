import type { Metadata } from 'next';
import { FrontDeskInboxPage } from './FrontDeskInboxPage';

export const metadata: Metadata = { title: 'Questions', robots: { index: false, follow: false } };

export default function Page() {
  return <FrontDeskInboxPage />;
}
