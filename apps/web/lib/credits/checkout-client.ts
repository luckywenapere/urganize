'use client';

import { authHeaders, readError } from '@/components/press-kits/press-kit-client';
import type { CreditsReturnPath } from '@/lib/credits/purchase';
import { openPaystackCheckout } from '@/lib/pitch-payments-client';

/**
 * Open the payment page for one credit pack (POST /api/credits/checkout). The
 * server decides the credits and the currency; the client only names the pack
 * by its Naira price. Resolves to an error message to show, or null once the
 * payment page has opened (or the person is not signed in, which the caller
 * has nothing to say about).
 */
export async function startCreditsCheckout(priceNaira: number, returnTo: CreditsReturnPath): Promise<string | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const response = await fetch('/api/credits/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify({ priceNaira, returnTo }),
    });
    if (!response.ok) return await readError(response, 'Could not open the payment page. Try again.');
    const body = (await response.json()) as { authorizationUrl?: string };
    if (!body.authorizationUrl) return 'Could not open the payment page. Try again.';
    await openPaystackCheckout(body.authorizationUrl);
    return null;
  } catch {
    return 'Could not reach Urganize. Check your connection and try again.';
  }
}
