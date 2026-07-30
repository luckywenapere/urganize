import type { Metadata } from 'next';
import InterviewsAdminPageClient from './InterviewsAdminPageClient';

export const metadata: Metadata = {
  title: 'Interviews',
};

export default function InterviewsAdminPage() {
  return <InterviewsAdminPageClient />;
}
