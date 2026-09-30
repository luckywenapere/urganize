'use client';

import { supabase } from '@/lib/supabase/client';

// The admin email pages' one way to call /api/admin/emails/*. Carries the
// session token, and turns a 401/403 into { forbidden: true } so each page can
// bounce a non-admin home the way the other admin pages do.

export type AdminResponse<T> =
  | { ok: true; data: T }
  | { ok: false; forbidden: boolean; error: string };

export async function adminRequest<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<AdminResponse<T>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, forbidden: true, error: 'Signed out.' };

    const response = await fetch(path, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, forbidden: true, error: payload.error || 'Not allowed.' };
    }
    if (!response.ok) return { ok: false, forbidden: false, error: payload.error || 'Something went wrong.' };
    return { ok: true, data: payload };
  } catch {
    return { ok: false, forbidden: false, error: 'Could not reach the server.' };
  }
}

export type BudgetPayload = {
  dailyLimit: number;
  sentToday: number | null;
  bulkLeft: number | null;
  reserve: number;
};

/** "12 of 100 emails sent today." in one place, so the three pages agree. */
export function describeBudget(budget: BudgetPayload | null | undefined): string {
  if (!budget) return '';
  if (budget.sentToday === null) return `Your plan allows ${budget.dailyLimit} emails a day.`;
  return `${budget.sentToday} of ${budget.dailyLimit} emails sent today.`;
}
