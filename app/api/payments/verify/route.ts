import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get('reference');

  if (!reference) {
    return NextResponse.json({ error: 'No reference provided' }, { status: 400 });
  }

  try {
    // Verify with Paystack
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
      const { email, customer } = data.data;
      const amount = data.data.amount / 100; // Convert from kobo
      const plan = data.data.metadata?.plan || 'monthly';

      // Get user by email
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (!profile) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Calculate expiry date
const expiresAt = new Date();
if (plan === 'yearly') {
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
} else if (plan === '8months') {
  expiresAt.setMonth(expiresAt.getMonth() + 8);
} else {
  expiresAt.setMonth(expiresAt.getMonth() + 1);
}


      // Save payment record
      await supabaseAdmin.from('payments').insert({
        user_id: profile.id,
        amount,
        reference,
        status: 'success',
        plan,
        paystack_response: data.data,
      });

      // Create or update subscription
      await supabaseAdmin
        .from('subscriptions')
        .upsert({
          user_id: profile.id,
          plan,
          status: 'active',
          amount,
          paystack_reference: reference,
          paystack_customer_code: customer.customer_code,
          started_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      // Update profile
      await supabaseAdmin
        .from('profiles')
        .update({ is_subscribed: true })
        .eq('id', profile.id);

      return NextResponse.json({
        status: 'success',
        plan,
        expires_at: expiresAt.toISOString(),
      });
    }

    return NextResponse.json({ status: 'failed', message: data.message }, { status: 400 });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}