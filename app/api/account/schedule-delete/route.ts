import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const DELETION_WINDOW_DAYS = 30;

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const confirmationText = body?.confirmationText as string | undefined;

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser(token);

  if (userError || !user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if ((confirmationText || '').trim() !== 'DELETE') {
    return NextResponse.json({ error: 'Please type DELETE exactly to continue' }, { status: 400 });
  }

  const now = new Date();
  const scheduledDeletion = new Date(now);
  scheduledDeletion.setDate(now.getDate() + DELETION_WINDOW_DAYS);

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const nextMetadata = {
    ...(user.user_metadata || {}),
    deletion_requested_at: now.toISOString(),
    scheduled_deletion_at: scheduledDeletion.toISOString(),
  };

  const { error: adminUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  });

  if (adminUpdateError) {
    return NextResponse.json({ error: 'Failed to schedule account deletion' }, { status: 500 });
  }

  await supabaseAdmin
    .from('profiles')
    .update({ is_subscribed: false, updated_at: now.toISOString() })
    .eq('id', user.id);

  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: now.toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'active');

  return NextResponse.json({
    status: 'scheduled',
    scheduled_deletion_at: scheduledDeletion.toISOString(),
    recovery: 'support-only',
    recovery_contact: 'theurganization@gmail.com',
  });
}
