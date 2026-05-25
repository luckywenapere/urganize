import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const nowIso = new Date().toISOString();

  const { data: releases } = await supabaseAdmin
    .from('releases')
    .select('id')
    .eq('owner_user_id', user.id);
  const releaseIds = (releases || []).map((item) => item.id);

  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: nowIso })
    .eq('user_id', user.id)
    .eq('status', 'active');

  await supabaseAdmin.from('payments').delete().eq('user_id', user.id).neq('plan', 'trial_claim');
  await supabaseAdmin.from('subscriptions').delete().eq('user_id', user.id);
  if (releaseIds.length > 0) {
    await supabaseAdmin.from('ai_tasks').delete().in('release_id', releaseIds);
    await supabaseAdmin.from('release_profiles').delete().in('release_id', releaseIds);
  }

  await supabaseAdmin.from('releases').delete().eq('owner_user_id', user.id);
  await supabaseAdmin.from('profiles').delete().eq('id', user.id);

  const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id, false);
  if (deleteAuthError) {
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }

  return NextResponse.json({
    status: 'deleted',
    deleted_at: nowIso,
  });
}
