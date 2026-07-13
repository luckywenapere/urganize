import type { Metadata } from 'next';
import { Suspense } from 'react';
import RedeemPageClient from './RedeemPageClient';

// Thin server wrapper so this route gets a real browser-tab title through the
// root layout's '%s | Urganize' template — the page itself is a client
// component and cannot export metadata.
export const metadata: Metadata = {
  title: 'Redeem a code',
};

export default function RedeemPage() {
  // RedeemPageClient reads ?code= via useSearchParams, which requires a
  // Suspense boundary under the App Router.
  return (
    <Suspense fallback={null}>
      <RedeemPageClient />
    </Suspense>
  );
}
