import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_PAYWALL_ENABLED,
  PAYWALL_SETTING_KEY,
  isMissingTableError,
  resolvePaywallEnabled,
  resolvePaywallUpdatedAt,
} from '@/lib/paywall-config';

const parseAdminEmails = (): string[] => {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

const verifyAdmin = async (req: NextRequest): Promise<
  | { ok: true; supabaseAdmin: ReturnType<typeof createClient>; userId: string }
  | { ok: false; response: NextResponse }
> => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmails = parseAdminEmails();

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }),
    };
  }

  if (adminEmails.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'ADMIN_EMAILS is not configured' }, { status: 500 }),
    };
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabaseUserClient = createClient(supabaseUrl, serviceRoleKey);
  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser(token);

  if (userError || !user?.id || !user.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  if (!adminEmails.includes(normalizedEmail)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return {
    ok: true,
    supabaseAdmin: createClient(supabaseUrl, serviceRoleKey),
    userId: user.id,
  };
};

const loadPaywallState = async (supabaseAdmin: ReturnType<typeof createClient>) => {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('value_json,updated_at')
    .eq('key', PAYWALL_SETTING_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return {
        ok: true as const,
        enabled: DEFAULT_PAYWALL_ENABLED,
        updatedAt: null,
        source: 'missing_table' as const,
      };
    }

    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Could not load paywall setting' }, { status: 500 }),
    };
  }

  return {
    ok: true as const,
    enabled: resolvePaywallEnabled(data),
    updatedAt: resolvePaywallUpdatedAt(data),
    source: 'database' as const,
  };
};

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  const paywallState = await loadPaywallState(adminResult.supabaseAdmin);
  if (!paywallState.ok) return paywallState.response;

  return NextResponse.json({
    enabled: paywallState.enabled,
    updatedAt: paywallState.updatedAt,
    source: paywallState.source,
  });
}

export async function POST(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  const body = await req.json().catch(() => ({}));
  const enabled = (body as Record<string, unknown>).enabled;
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const appSettingsTable = adminResult.supabaseAdmin.from('app_settings') as any;
  const { error: upsertError } = await appSettingsTable.upsert(
    {
      key: PAYWALL_SETTING_KEY,
      value_json: { enabled },
      updated_at: nowIso,
      updated_by: adminResult.userId,
    },
    { onConflict: 'key' }
  );

  if (upsertError) {
    if (isMissingTableError(upsertError)) {
      return NextResponse.json(
        {
          error: 'Missing app_settings table. Create it before using this admin control.',
          sql: [
            'create table if not exists public.app_settings (',
            '  key text primary key,',
            '  value_json jsonb not null default \'{}\'::jsonb,',
            '  updated_at timestamptz not null default now(),',
            '  updated_by uuid null',
            ');',
          ].join('\n'),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: 'Could not save paywall setting' }, { status: 500 });
  }

  return NextResponse.json({
    enabled,
    updatedAt: nowIso,
    source: 'database',
  });
}
