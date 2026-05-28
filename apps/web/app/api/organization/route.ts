import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ORGANIZATIONS_TABLE = 'organizations';
const MEMBERS_TABLE = 'organization_members';

const isMissingTableError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
};

const ORG_SQL = [
  'create table if not exists public.organizations (',
  '  id uuid primary key default gen_random_uuid(),',
  '  name text not null,',
  '  owner_id uuid not null references auth.users(id) on delete cascade,',
  '  plan text null,',
  '  trial_started_at timestamptz null,',
  '  trial_ends_at timestamptz null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'create table if not exists public.organization_members (',
  '  id uuid primary key default gen_random_uuid(),',
  '  organization_id uuid not null references public.organizations(id) on delete cascade,',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  role text not null default \'viewer\',',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now(),',
  '  unique (organization_id, user_id)',
  ');',
].join('\n');

const getAuthenticatedUser = async (request: NextRequest) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);
  if (userError || !user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  // Global access gate. Returns 402 + /locked redirect when the user has no
  // active paid subscription or running trial. Allowlisted emails bypass.
  const { requireActiveAccount } = await import('@/app/api/_shared/paywall');
  const block = await requireActiveAccount(user.id, user.email);
  if (block) {
    return { error: block };
  }

  return { user, supabaseUrl };
};

const createAdminClient = (supabaseUrl: string) => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
};

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data: organization, error } = await adminClient
    .from(ORGANIZATIONS_TABLE)
    .select('id,name,owner_id,created_at,updated_at')
    .eq('owner_id', auth.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: 'Organization tables are missing', sql: ORG_SQL },
        { status: 501 }
      );
    }
    return NextResponse.json({ error: error.message || 'Could not load organization' }, { status: 500 });
  }

  return NextResponse.json({ organization: organization || null });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String((body as Record<string, unknown>).name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
  }

  const { data: existingOrg, error: existingError } = await adminClient
    .from(ORGANIZATIONS_TABLE)
    .select('id,name,owner_id,created_at,updated_at')
    .eq('owner_id', auth.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError)) {
      return NextResponse.json(
        { error: 'Organization tables are missing', sql: ORG_SQL },
        { status: 501 }
      );
    }
    return NextResponse.json({ error: existingError.message || 'Could not load organization' }, { status: 500 });
  }

  if (existingOrg) {
    const { data: updatedOrg, error: updateError } = await adminClient
      .from(ORGANIZATIONS_TABLE)
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', existingOrg.id)
      .eq('owner_id', auth.user.id)
      .select('id,name,owner_id,created_at,updated_at')
      .maybeSingle();
    if (updateError) {
      return NextResponse.json({ error: updateError.message || 'Could not update organization' }, { status: 500 });
    }
    return NextResponse.json({ organization: updatedOrg || existingOrg, status: 'updated' });
  }

  const { data: insertedOrg, error: insertError } = await adminClient
    .from(ORGANIZATIONS_TABLE)
    .insert({
      name,
      owner_id: auth.user.id,
      updated_at: new Date().toISOString(),
    })
    .select('id,name,owner_id,created_at,updated_at')
    .maybeSingle();

  if (insertError || !insertedOrg?.id) {
    if (isMissingTableError(insertError)) {
      return NextResponse.json(
        { error: 'Organization tables are missing', sql: ORG_SQL },
        { status: 501 }
      );
    }
    return NextResponse.json({ error: insertError?.message || 'Could not create organization' }, { status: 500 });
  }

  const { error: memberError } = await adminClient.from(MEMBERS_TABLE).upsert(
    {
      organization_id: insertedOrg.id,
      user_id: auth.user.id,
      role: 'manager',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,user_id' }
  );

  if (memberError && !isMissingTableError(memberError)) {
    return NextResponse.json({ error: memberError.message || 'Could not create owner membership' }, { status: 500 });
  }

  return NextResponse.json({ organization: insertedOrg, status: 'created' });
}
