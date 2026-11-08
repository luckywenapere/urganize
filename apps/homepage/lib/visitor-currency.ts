"use client";

import { useEffect, useState } from "react";

// The currency this visitor sees prices in (#1120). Naira first, then US
// dollars once /api/currency says the visitor is outside Nigeria. One request
// per page load, shared by every price on the page.

export type VisitorCurrency = "NGN" | "USD";

let cached: VisitorCurrency | null = null;
let pending: Promise<VisitorCurrency> | null = null;

function load(): Promise<VisitorCurrency> {
  if (cached) return Promise.resolve(cached);
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
  return currency;
}
