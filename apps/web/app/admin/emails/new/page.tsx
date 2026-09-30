import type { Metadata } from 'next';
import ComposeEmailPageClient from './ComposeEmailPageClient';

export const metadata: Metadata = {
  title: 'Send an email',
};

export default function ComposeEmailPage() {
  return <ComposeEmailPageClient />;
}
