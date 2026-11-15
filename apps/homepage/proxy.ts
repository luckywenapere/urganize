import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_CURRENCY_COOKIE, pricingCurrencyForCountry } from "@urganize/pricing";

// Tells the page which currency to show before it paints (#1301): naira in
// Nigeria, US dollars everywhere else. Vercel puts the visitor's country on the
// request; we copy the answer into a cookie on the page's own response, and the
// inline script in app/layout.tsx reads it. Pages stay static: this only adds a
// header. With no country (local dev) it does nothing and the page asks
// /api/currency instead.
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const country = request.headers.get("x-vercel-ip-country");
  if (!country) return response;
  const currency = pricingCurrencyForCountry(country);
  if (request.cookies.get(VISITOR_CURRENCY_COOKIE)?.value !== currency) {
    response.cookies.set(VISITOR_CURRENCY_COOKIE, currency, {
      path: "/",
      maxAge: 60 * 60 * 24,
      sameSite: "lax",
      secure: true,
    });
  }
  return response;
}

export const config = {
  // Pages only: not Next's own files, API routes or anything with an extension.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
