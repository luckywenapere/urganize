import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const normalizeEmail = (value: unknown): string => String(value || '').trim().toLowerCase();

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail((body as Record<string, unknown>).email);

  if (!email || !email.includes('@')) {
    return NextResponse.json({ hasGoogle: false, hasEmailProvider: false }, { status: 200 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: 'Could not resolve auth provider' }, { status: 500 });
  }

  if (!profile?.id) {
    return NextResponse.json({ hasGoogle: false, hasEmailProvider: false }, { status: 200 });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
  if (userError || !userData?.user) {
    return NextResponse.json({ hasGoogle: false, hasEmailProvider: false }, { status: 200 });
  }

  const identities = Array.isArray(userData.user.identities) ? userData.user.identities : [];
  const providers = identities
    .map((identity) => String((identity as { provider?: string })?.provider || '').toLowerCase())
    .filter(Boolean);

  return NextResponse.json({
    hasGoogle: providers.includes('google'),
    hasEmailProvider: providers.includes('email'),
  });
}
