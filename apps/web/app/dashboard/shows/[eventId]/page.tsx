import type { Metadata } from 'next';
import ShowPageClient from './ShowPageClient';

export const metadata: Metadata = {
  title: 'Show',
};

export default function ShowPage() {
  return <ShowPageClient />;
}
