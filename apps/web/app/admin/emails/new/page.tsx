import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import ComposeEmailPageClient from './ComposeEmailPageClient';

export const metadata: Metadata = {
  title: 'Send an email',
};

// The client reads a prefilled draft from the query string (useSearchParams),
// which needs a Suspense boundary so the route can still be built static.
export default function ComposeEmailPage() {
  return (
    <Suspense fallback={<AdminPageSkeleton titleWidth="w-56" descriptionLines={2} formFields={4} />}>
      <ComposeEmailPageClient />
    </Suspense>
  );
}
