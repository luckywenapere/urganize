'use client';

import { supabase } from '@/lib/supabase/client';

/**
 * The two request helpers the press kit screens share.
 *
 * One copy for this surface rather than a third and fourth inside each page,
 * which is the collapse components/content-calendar/get-access-token.ts already
 * made for the calendar after four had accumulated.
 */
export async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    /* non-JSON */
  }
  return fallback;
}

/**
 * The raw token, for the upload module, which builds its own headers because
 * step 2 PUTs to Supabase with a different Content-Type than the two JSON
 * calls either side of it.
 */
export async function accessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}
