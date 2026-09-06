import type { Metadata } from 'next';
import { DirectoryPageClient } from './DirectoryPageClient';

export const metadata: Metadata = {
  title: 'Directory · Urganize',
};

export default function DirectoryPage() {
  return <DirectoryPageClient />;
}
