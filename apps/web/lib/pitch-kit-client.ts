'use client';

import { supabase } from '@/lib/supabase/client';
export { kitNoteLine, noteWithKit, noteRoom } from '@/lib/pitch-kit-link';

export type PublishKitResponse =
  | { ok: true; url: string; path: string }
  | { ok: false; error: string; code?: string };

/**
 * "Copy kit link": make and publish the artist kit if needed and get this
 * rollout's kit link back. See lib/release-kit-publish-server.ts.
 */
export async function publishReleaseKitLink(releaseId: string): Promise<PublishKitResponse> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    if (!token) return { ok: false, error: 'Your session expired. Sign in again.' };
    const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/pitch-kit/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json().catch(() => ({}))) as { path?: string; error?: string; code?: string };
    if (!response.ok || !body.path) {
      return { ok: false, error: body.error || 'Could not share the kit. Try again.', code: body.code };
    }
    return { ok: true, path: body.path, url: absoluteKitUrl(body.path) };
  } catch {
    return { ok: false, error: 'Could not reach the server. Try again.' };
  }
}

export function absoluteKitUrl(path: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${path}`;
}

