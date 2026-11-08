import { NextRequest, NextResponse } from "next/server";
import { pricingCurrencyForCountry } from "@urganize/pricing";

// Which currency a visitor sees prices in (#1120): US dollars outside Nigeria,
// Naira in it or when we cannot tell. The pricing page stays a static page and
// asks this once after it loads, so a Nigerian visitor never waits for it. It
// reads only the country Vercel puts on the request.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const currency = pricingCurrencyForCountry(request.headers.get("x-vercel-ip-country"));
  return NextResponse.json({ currency }, { headers: { "Cache-Control": "private, no-store" } });
}
