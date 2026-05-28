import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePaidAccess } from '../../_shared/paywall';

const ORGANIZATIONS_TABLE = 'organizations';
const MEMBERS_TABLE = 'organization_members';
const PROFILES_TABLE = 'profiles';

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

const loadOwnerOrganization = async (adminClient: ReturnType<typeof createAdminClient>, userId: string) => {
  const { data: organization, error } = await adminClient!
    .from(ORGANIZATIONS_TABLE)
    .select('id,name,owner_id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return { organization, error };
};

const ALLOWED_ROLES = new Set(['manager', 'artist', 'team-member', 'viewer']);

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { organization, error: orgError } = await loadOwnerOrganization(adminClient, auth.user.id);
  if (orgError) {
    if (isMissingTableError(orgError)) {
      return NextResponse.json({ error: 'Organization tables are missing', sql: ORG_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: orgError.message || 'Could not load organization' }, { status: 500 });
  }
  if (!organization?.id) {
    return NextResponse.json({ members: [], organization: null });
  }

  const { data: members, error: membersError } = await adminClient
    .from(MEMBERS_TABLE)
    .select('id,user_id,role,created_at,updated_at')
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: true });
  if (membersError) {
    if (isMissingTableError(membersError)) {
      return NextResponse.json({ error: 'Organization tables are missing', sql: ORG_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: membersError.message || 'Could not load members' }, { status: 500 });
  }

  const userIds = (members || []).map((member) => member.user_id).filter(Boolean);
  const { data: profiles, error: profilesError } = userIds.length
    ? await adminClient.from(PROFILES_TABLE).select('id,name,email').in('id', userIds)
    : { data: [], error: null as { message?: string } | null };
  if (profilesError) {
    return NextResponse.json({ error: profilesError.message || 'Could not load member profiles' }, { status: 500 });
  }

  type ProfileRow = { id: string; name: string | null; email: string | null };
  type MemberRow = {
    id: string;
    user_id: string;
    role: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  const profileById = new Map(
    (profiles || []).map((profile: ProfileRow) => [profile.id, profile]),
  );
  const normalizedMembers = (members || []).map((member: MemberRow) => {
    const profile = profileById.get(member.user_id);
    return {
      id: member.id,
      user_id: member.user_id,
      role: member.role || 'viewer',
      name: profile?.name || 'Unknown',
      email: profile?.email || '',
      created_at: member.created_at,
      updated_at: member.updated_at,
    };
  });

  return NextResponse.json({ organization, members: normalizedMembers });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const paywallResponse = await requirePaidAccess(auth.user.id, {
    feature: 'team_collaboration',
    message: 'Upgrade required to invite teammates.',
  });
  if (paywallResponse) return paywallResponse;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { organization, error: orgError } = await loadOwnerOrganization(adminClient, auth.user.id);
  if (orgError) {
    if (isMissingTableError(orgError)) {
      return NextResponse.json({ error: 'Organization tables are missing', sql: ORG_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: orgError.message || 'Could not load organization' }, { status: 500 });
  }
  if (!organization?.id) {
    return NextResponse.json({ error: 'Create organization first' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String((body as Record<string, unknown>).email || '').trim().toLowerCase();
  const roleRaw = String((body as Record<string, unknown>).role || '').trim().toLowerCase();
  const role = ALLOWED_ROLES.has(roleRaw) ? roleRaw : 'viewer';
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await adminClient
    .from(PROFILES_TABLE)
    .select('id,name,email')
    .eq('email', email)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: profileError.message || 'Could not resolve user by email' }, { status: 500 });
  }
  if (!profile?.id) {
    return NextResponse.json({ error: 'No user found with that email yet' }, { status: 404 });
  }

  const { data: member, error: memberError } = await adminClient
    .from(MEMBERS_TABLE)
    .upsert(
      {
        organization_id: organization.id,
        user_id: profile.id,
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,user_id' }
    )
    .select('id,user_id,role,created_at,updated_at')
    .maybeSingle();
  if (memberError) {
    if (isMissingTableError(memberError)) {
      return NextResponse.json({ error: 'Organization tables are missing', sql: ORG_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: memberError.message || 'Could not add member' }, { status: 500 });
  }

  return NextResponse.json({
    member: {
      id: member?.id || '',
      user_id: profile.id,
      role,
      name: profile.name || 'Unknown',
      email: profile.email || '',
      created_at: member?.created_at || new Date().toISOString(),
      updated_at: member?.updated_at || new Date().toISOString(),
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }
  const { organization, error: orgError } = await loadOwnerOrganization(adminClient, auth.user.id);
  if (orgError) {
    return NextResponse.json({ error: orgError.message || 'Could not load organization' }, { status: 500 });
  }
  if (!organization?.id) {
    return NextResponse.json({ error: 'Create organization first' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const memberId = String((body as Record<string, unknown>).memberId || '').trim();
  const roleRaw = String((body as Record<string, unknown>).role || '').trim().toLowerCase();
  const role = ALLOWED_ROLES.has(roleRaw) ? roleRaw : '';
  if (!memberId || !role) {
    return NextResponse.json({ error: 'memberId and valid role are required' }, { status: 400 });
  }

  const { data: member, error: memberError } = await adminClient
    .from(MEMBERS_TABLE)
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('organization_id', organization.id)
    .select('id,user_id,role,created_at,updated_at')
    .maybeSingle();
  if (memberError) {
    return NextResponse.json({ error: memberError.message || 'Could not update role' }, { status: 500 });
  }
  if (!member?.id) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  return NextResponse.json({ status: 'updated', member });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }
  const { organization, error: orgError } = await loadOwnerOrganization(adminClient, auth.user.id);
  if (orgError) {
    return NextResponse.json({ error: orgError.message || 'Could not load organization' }, { status: 500 });
  }
  if (!organization?.id) {
    return NextResponse.json({ error: 'Create organization first' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const memberId = String((body as Record<string, unknown>).memberId || '').trim();
  if (!memberId) {
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
  }

  const { data: member, error: memberError } = await adminClient
    .from(MEMBERS_TABLE)
    .select('id,user_id')
    .eq('id', memberId)
    .eq('organization_id', organization.id)
    .maybeSingle();
  if (memberError) {
    return NextResponse.json({ error: memberError.message || 'Could not resolve member' }, { status: 500 });
  }
  if (!member?.id) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }
  if (member.user_id === auth.user.id) {
    return NextResponse.json({ error: 'Owner cannot remove themselves' }, { status: 400 });
  }

  const { error: deleteError } = await adminClient
    .from(MEMBERS_TABLE)
    .delete()
    .eq('id', memberId)
    .eq('organization_id', organization.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || 'Could not remove member' }, { status: 500 });
  }

  return NextResponse.json({ status: 'removed' });
}
