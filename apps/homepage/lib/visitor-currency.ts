"use client";

import { useEffect, useState } from "react";
import { currencyFromCookieHeader } from "@urganize/pricing";

// The currency this visitor sees prices in: naira in Nigeria, US dollars
// everywhere else (#1120, #1301).
//
// The proxy (proxy.ts) puts the answer in a cookie on the page's own response,
// and an inline script in layout.tsx reads it before the page paints. For a
// visitor outside Nigeria that script hides every price (data-visitor-price)
// until this hook has swapped them to dollars, so naira never shows. No cookie
// (local dev, or a request the proxy did not see) falls back to /api/currency.

export type VisitorCurrency = "NGN" | "USD";

let cached: VisitorCurrency | null = null;
let pending: Promise<VisitorCurrency> | null = null;

function fromCookie(): VisitorCurrency | null {
  try {
    return currencyFromCookieHeader(document.cookie);
  } catch {
    return null;
  }
}

function load(): Promise<VisitorCurrency> {
  if (cached) return Promise.resolve(cached);
  const cookie = fromCookie();
  if (cookie) {
    cached = cookie;
    return Promise.resolve(cookie);
  }
  if (!pending) {
    pending = fetch("/api/currency", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { currency?: unknown } | null) => {
        cached = body?.currency === "USD" ? "USD" : "NGN";
        return cached;
      })
      .catch(() => "NGN" as const);
  }
  return pending;
}

/** Show the prices the pre-paint script hid, now that they are right. */
function revealPrices() {
  try {
    document.documentElement.dataset.currencyReady = "1";
  } catch {
    // Nothing to reveal outside a browser.
  }
}

export function useVisitorCurrency(): VisitorCurrency {
  const [currency, setCurrency] = useState<VisitorCurrency>(cached ?? "NGN");
  useEffect(() => {
    let live = true;
    void load().then((value) => {
      if (live) setCurrency(value);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    // Runs after the render that shows the resolved currency has committed.
    if (cached && currency === cached) revealPrices();
  }, [currency]);
  return currency;
}
