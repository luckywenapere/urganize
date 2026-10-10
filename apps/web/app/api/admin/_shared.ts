import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

/**
 * "Our team": ADMIN_EMAILS plus the optional METRICS_INTERNAL_EMAILS, lower
 * case. /admin/metrics has left these people out of its numbers since
 * 2026-10-07; since 2026-10-10 the founder cockpit and the Scoreboard leave
 * the same people out (founder's answer, lib/admin-internal-accounts.ts). One
 * list for every admin page, so the pages cannot disagree about who is us.
 */
export const internalAccountEmails = (): Set<string> => {
  const extra = String(process.env.METRICS_INTERNAL_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...parseAdminEmails(), ...extra]);
};

// supabaseAdmin is annotated `SupabaseClient` rather than inferred via
// ReturnType<typeof createClient>, matching createAdminClient in
// app/api/_shared/auth.ts. The inferred form resolves to a client whose schema
// declares no tables, so EVERY table's row type collapses to `never`: reads
// still compile where a route casts the result to Record<string, unknown> (as
// most admin routes do), but any .insert()/.update() with an object literal, or
// any direct field access off .maybeSingle(), fails to type check. Keep the
// annotation.
export const verifyAdmin = async (req: NextRequest): Promise<
  | { ok: true; supabaseAdmin: SupabaseClient; userId: string; email: string }
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
    // The admin's own address: where the email composer sends a test.
    email: normalizedEmail,
  };
};
