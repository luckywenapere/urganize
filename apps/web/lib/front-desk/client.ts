'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

// Browser side of the front desk: one authed fetch and the "is it on for me?"
// probe every page starts with. The flag itself is decided on the server
// (lib/front-desk/flag.ts); a 404 here means old behaviour.

export type DeskFetchResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; body?: Record<string, unknown> };

export async function deskFetch<T>(path: string, init: RequestInit = {}): Promise<DeskFetchResult<T>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, status: 401, error: 'Sign in again.' };
    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      return { ok: false, status: response.status, error: typeof body?.error === 'string' ? body.error : 'Something went wrong.', body: body ?? undefined };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, error: "You're offline." };
  }
}

export type DeskAccess =
  | { state: 'loading' }
  | { state: 'signed_out' }
  | { state: 'off' }
  | { state: 'on'; isCurator: boolean; curatorName: string | null };

export function useDeskAccess(): DeskAccess {
  const [access, setAccess] = useState<DeskAccess>({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!alive) return;
      if (!session) {
        setAccess({ state: 'signed_out' });
        return;
      }
      const result = await deskFetch<{ enabled: boolean; isCurator: boolean; curatorName: string | null }>('/api/front-desk/me');
      if (!alive) return;
      if (!result.ok) {
        setAccess({ state: result.status === 401 ? 'signed_out' : 'off' });
        return;
      }
      setAccess({ state: 'on', isCurator: result.data.isCurator, curatorName: result.data.curatorName });
    })();
    return () => {
      alive = false;
    };
  }, []);
  return access;
}
