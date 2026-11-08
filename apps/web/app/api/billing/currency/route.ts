import { NextRequest, NextResponse } from 'next/server';
import { isBachsConfigured, payerCurrency } from '@/lib/bachs';

// Which currency a visitor sees prices in (#1120): US dollars outside Nigeria,
// Naira in it or when we cannot tell. OPEN on purpose: the sign-up and checkout
// screens show a price before anyone has an account. It reads only the country
// Vercel puts on the request and says nothing about the visitor beyond the
// currency.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const currency = payerCurrency(isBachsConfigured(), request.headers.get('x-vercel-ip-country'));
  return NextResponse.json({ currency }, { headers: { 'Cache-Control': 'private, no-store' } });
}
