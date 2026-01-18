import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // For now, just acknowledge receipt
  // We'll add verification logic later
  return NextResponse.json({ received: true }, { status: 200 });
}

// Paystack also sends a GET request to verify the URL exists
export async function GET() {
  return NextResponse.json({ status: 'Webhook endpoint active' }, { status: 200 });
}