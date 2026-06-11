import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireActiveAccount } from '@/app/api/_shared/paywall';

// Single source of truth for API route auth. This replaces the per-domain
// copies that used to live in releases/_shared.ts, tasks-server.ts,
// ui-drafts/_shared.ts, pricing-validation/_shared.ts, and inline in the
// organization routes. Domain _shared.ts files re-export from here so
// route-level import sites stay stable.

// Validates the Authorization: Bearer <token> header against the Supabase
// anon client. Returns { user, supabaseUrl } or { error } with a ready
// NextResponse (500 on missing env, 401 on missing/invalid token).
//
// Return type is intentionally inferred: callers check both `'error' in auth`
// and `auth.error`, and the second style needs the implicit
// `error?: undefined` member that inference adds to the success branch.
export async function getAuthenticatedUser(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);
  if (userError || !user?.id) {
    return { error: NextResponse.json({ error: `Unauthorized: ${userError?.message || 'Invalid or expired token'}` }, { status: 401 }) };
  }

  return { user, supabaseUrl };
}

// Auth + global access gate in a single call. Use this on protected routes.
// Returns { error } either when auth fails (401) or when the user has no
// active paid/trial access (402 + redirect: '/locked'). Open routes (auth,
// trial/start, payments/verify, webhooks, subscription-status, admin/*,
// account/delete-now, user/onboarding, pricing-validation) keep using
// getAuthenticatedUser directly — they must work when the user is locked.
export async function requireActiveAuthenticatedUser(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth;
  const block = await requireActiveAccount(auth.user.id, auth.user.email);
  if (block) return { error: block };
  return auth;
}

// Service-role client for privileged server operations. Only use when
// bypassing RLS is required AND the request is already authorized.
export function createAdminClient(supabaseUrl: string): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}
