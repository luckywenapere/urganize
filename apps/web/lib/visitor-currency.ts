'use client';

import { useEffect, useState } from 'react';

// The currency a visitor sees prices in before they have an account (#1120).
// Asks /api/billing/currency once per page load and remembers the answer.
// Naira until it answers, and Naira if it cannot, because most of our buyers
// are in Nigeria and a Naira price is never one we cannot charge.

export type VisitorCurrency = 'NGN' | 'USD';

let cached: VisitorCurrency | null = null;
let pending: Promise<VisitorCurrency> | null = null;

function load(): Promise<VisitorCurrency> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = fetch('/api/billing/currency', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { currency?: unknown } | null) => {
        cached = body?.currency === 'USD' ? 'USD' : 'NGN';
        return cached;
      })
      .catch(() => 'NGN' as const);
  }
  return pending;
}

export function useVisitorCurrency(): VisitorCurrency {
  const [currency, setCurrency] = useState<VisitorCurrency>(cached ?? 'NGN');
  useEffect(() => {
    let live = true;
    void load().then((value) => {
      if (live) setCurrency(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return currency;
}
