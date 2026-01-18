import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get('reference');
  
  if (!reference) {
    return NextResponse.json({ error: 'No reference provided' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = await response.json();

    if (data.status && data.data.status === 'success') {
      // TODO: Update user subscription in Supabase here
      
      return NextResponse.json({ 
        status: 'success', 
        amount: data.data.amount,
        email: data.data.customer.email 
      });
    }

    return NextResponse.json({ status: 'failed' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}