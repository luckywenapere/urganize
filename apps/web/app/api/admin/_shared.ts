import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';

// The waitlist + growth dashboards were ported into this hub from
// apps/homepage (founder request, 2026-07-30) and read the marketing site's
// Neon database directly — the same DATABASE_URL the homepage uses, now
// also set on the Web Vercel project. Returns null when unconfigured so
// routes can 500 with a clear message instead of throwing.
export const getNeonClient = (): ReturnType<typeof neon> | null => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;
  return neon(databaseUrl);
};

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
