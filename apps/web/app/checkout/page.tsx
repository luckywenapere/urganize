import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingMark } from '@urganize/ui';
import CheckoutPageClient from './CheckoutPageClient';

// Self-serve checkout (2026-10-22). Thin server wrapper so the route can name
// itself; the page is a client component (it reads the session).
export const metadata: Metadata = {
  title: 'Checkout',
};

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <LoadingMark />
        </main>
      }
    >
      <CheckoutPageClient />
    </Suspense>
  );
}
