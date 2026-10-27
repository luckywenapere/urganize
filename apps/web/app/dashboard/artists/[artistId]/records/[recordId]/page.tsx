import type { Metadata } from 'next';
import RecordPageClient from './RecordPageClient';

// The record's name is not known until it loads, so the title is the generic one.
export const metadata: Metadata = {
  title: 'Next record',
};

export default function RecordPage() {
  return <RecordPageClient />;
}
