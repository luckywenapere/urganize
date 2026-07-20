import type { Metadata } from 'next';
import { Suspense } from 'react';
import CalendarPageClient from './CalendarPageClient';

// Thin server wrapper, same pattern as the release detail page: the real
// page is a client component (Zustand + browser fetches + useSearchParams)
// and can't export metadata itself. The root layout's '%s | Urganize'
// template turns this into "Content calendar | Urganize" in the browser tab.
export const metadata: Metadata = {
  title: 'Content calendar',
};

export default function ContentCalendarPage() {
  // CalendarPageClient reads ?calendar= and &month= via useSearchParams,
  // which requires a Suspense boundary under the App Router (the redeem
  // page precedent). The client component owns its own loading UI once
  // mounted (CalendarPageSkeleton), so the fallback here stays null.
  return (
    <Suspense fallback={null}>
      <CalendarPageClient />
    </Suspense>
  );
}
