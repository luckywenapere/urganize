// POST /api/dayzero/claim — the activation page's one call (#1393).
//
// Body {code?}. With a code (the page just came back from Day Zero): swap it
// for a token, read the license, continue only if Day Zero says it is active.
//   - signed in (Bearer token) → attach it and Pro is on
//   - signed out → keep it in a signed, httpOnly cookie for an hour; the page
//     sends them to sign in or make an account, then calls again with no code
// Without a code: attach the license waiting in the cookie, if any.
//
// Open route (no paywall): a walled or brand-new account must be able to claim.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  DAYZERO_CLAIM_COOKIE,
  DAYZERO_CLAIM_TTL_SECONDS,
  DAYZERO_PENDING_COOKIE,
  decodeClaimCookie,
  encodeClaimCookie,
  type DayzeroClaimState,
} from '@/lib/dayzero';
import {
  attachDayzeroLicense,
  exchangeDayzeroCode,
  fetchDayzeroLicense,
  markDayzeroLicenseActive,
  readDayzeroConfig,
} from '@/lib/dayzero-server';

export const dynamic = 'force-dynamic';

const MAX_CODE_LENGTH = 2048;

function reply(state: DayzeroClaimState, status = 200) {
  return NextResponse.json({ state }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function holdLicense(response: NextResponse, licenseKey: string, secret: string) {
  const expiresMs = Date.now() + DAYZERO_CLAIM_TTL_SECONDS * 1000;
  const base = { path: '/', sameSite: 'lax' as const, secure: true, maxAge: DAYZERO_CLAIM_TTL_SECONDS };
  response.cookies.set(DAYZERO_CLAIM_COOKIE, encodeClaimCookie(licenseKey, expiresMs, secret), { ...base, httpOnly: true });
  // Says only "a license is waiting", so the app knows to call back here.
  response.cookies.set(DAYZERO_PENDING_COOKIE, '1', { ...base, httpOnly: false });
}

function dropLicense(response: NextResponse) {
  response.cookies.set(DAYZERO_CLAIM_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(DAYZERO_PENDING_COOKIE, '', { path: '/', maxAge: 0 });
}

export async function POST(request: NextRequest) {
  const config = readDayzeroConfig();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const admin = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!config || !admin) return reply('error', 500);

  // Signed in is optional here: a signed-out buyer is the common case.
  let userId: string | null = null;
  if (request.headers.get('authorization')) {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) return reply('error', 401);
    userId = auth.user.id;
  }

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === 'string' ? body.code.trim() : '';

  if (code) {
    if (code.length > MAX_CODE_LENGTH) return reply('expired');
    // Must match the Redirect URL saved in Day Zero exactly. The page that
    // received the code is on this origin, at this path.
    const redirectUri = `${request.nextUrl.origin}/dayzero/callback`;
    const token = await exchangeDayzeroCode(config, code, redirectUri);
    if (!token) return reply('expired');
    const license = await fetchDayzeroLicense(config, token);
    if (!license) return reply('error', 502);
    if (license.status !== 'active') return reply('expired');

    try {
      await markDayzeroLicenseActive(admin, license.licenseKey);
    } catch (error) {
      console.warn('[dayzero] could not record activation', error instanceof Error ? error.message : error);
      return reply('error', 500);
    }

    if (!userId) {
      const response = reply('needs_account');
      holdLicense(response, license.licenseKey, config.clientSecret);
      return response;
    }

    const result = await attachDayzeroLicense(admin, userId, license.licenseKey);
    const response = reply(result, result === 'error' ? 500 : 200);
    // On "another account", keep it waiting so Switch account can finish it.
    if (result === 'other_account') holdLicense(response, license.licenseKey, config.clientSecret);
    else dropLicense(response);
    return response;
  }

  // No code: finish a claim that was waiting for sign-in.
  const waiting = decodeClaimCookie(request.cookies.get(DAYZERO_CLAIM_COOKIE)?.value, config.clientSecret);
  if (!waiting) {
    const response = reply('nothing');
    dropLicense(response);
    return response;
  }
  if (!userId) return reply('needs_account');

  const result = await attachDayzeroLicense(admin, userId, waiting);
  const response = reply(result, result === 'error' ? 500 : 200);
  if (result === 'attached' || result === 'expired') dropLicense(response);
  return response;
}
