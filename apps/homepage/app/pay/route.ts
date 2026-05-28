import { NextResponse } from 'next/server';

// Branded vanity redirect for the flat-tier ₦15,000 access SKU.
//
// Why this exists:
//   The /locked page in the web app needs a "Pay" button that takes the user
//   to a Paystack Payment Page. Sending users straight to a paystack.com URL
//   works but breaks brand continuity — they click a button on urganize.app
//   and land on a paystack.com URL. Routing through urganize.app/pay keeps
//   the URL bar in our domain until the redirect fires, and gives us a
//   shareable, memorable link to send to customers manually
//   ("urganize.app/pay" > "paystack.com/pay/a2dq-qpyri").
//
// Why a route handler (not next.config redirects):
//   The Paystack slug may change (renamed page, new tier, gateway swap).
//   Editing a constant in a TS file ships through normal PRs and code review;
//   editing next.config rewrites is uglier and harder to audit.
//
// 302 (not 301):
//   Temporary by design — the underlying Paystack URL may rotate. Don't let
//   browsers / proxies cache this permanently.

const PAYSTACK_PAYMENT_URL = 'https://paystack.com/pay/a2dq-qpyri';

export async function GET() {
  return NextResponse.redirect(PAYSTACK_PAYMENT_URL, 302);
}
