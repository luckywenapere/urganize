import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

type PaystackWebhookPayload = {
  event?: string;
  data?: {
    reference?: string;
  };
};

const validateSignature = (rawBody: string, signature: string | null, secret: string): boolean => {
  if (!signature) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return expected === signature;
};

export async function POST(req: NextRequest) {
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecretKey) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = req.headers.get('x-paystack-signature');
  const rawBody = await req.text();

  if (!validateSignature(rawBody, signature, paystackSecretKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = (JSON.parse(rawBody || '{}') || {}) as PaystackWebhookPayload;
  const event = payload.event || '';

  if (event === 'charge.success') {
    return NextResponse.json(
      {
        received: true,
        event,
        reference: payload.data?.reference || null,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({ received: true, event }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ status: 'Webhook endpoint active' }, { status: 200 });
}
