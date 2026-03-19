import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const parseAdminEmails = (): string[] => {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

export const verifyAdmin = async (req: NextRequest): Promise<
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
