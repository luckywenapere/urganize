'use client';

// Browser calls for the brief's daily question (#1314).

import { supabase } from '@/lib/supabase/client';
import type { BriefAnswerLine } from './brief-questions';

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === 'string' && body.error ? body.error : fallback;
}

export type BriefAnswerReply =
  | { ok: true; label: string; ack: string; already: boolean }
  | { ok: false; error: string; closed: boolean };

export async function answerBriefQuestion(date: string, choiceId: string): Promise<BriefAnswerReply> {
  try {
    const headers = await authHeaders();
    if (!headers) return { ok: false, error: 'Sign in again to answer.', closed: false };
    const response = await fetch('/api/morning-brief/answer', {
      method: 'POST',
      headers,
      body: JSON.stringify({ date, choiceId }),
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: unknown; closed?: unknown } | null;
      const error = typeof body?.error === 'string' && body.error ? body.error : 'Could not save your answer.';
      return { ok: false, error, closed: body?.closed === true };
    }
    const data = (await response.json()) as { label?: unknown; ack?: unknown; already?: unknown };
    if (typeof data.label !== 'string' || typeof data.ack !== 'string') {
      return { ok: false, error: 'Could not save your answer.', closed: false };
    }
    return { ok: true, label: data.label, ack: data.ack, already: data.already === true };
  } catch {
    return { ok: false, error: 'Could not reach Urganize. Check your connection.', closed: false };
  }
}

export type BriefPrefsView = { questionsOn: boolean; answers: BriefAnswerLine[] };

export async function loadBriefPrefs(
  change?: { questionsOn?: boolean; clear?: string }
): Promise<{ ok: true; view: BriefPrefsView } | { ok: false; error: string }> {
  try {
    const headers = await authHeaders();
    if (!headers) return { ok: false, error: 'Sign in again.' };
    const response = await fetch('/api/morning-brief/prefs', {
      method: change ? 'PATCH' : 'GET',
      headers,
      body: change ? JSON.stringify(change) : undefined,
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false, error: await readError(response, 'Could not load your answers.') };
    return { ok: true, view: (await response.json()) as BriefPrefsView };
  } catch {
    return { ok: false, error: 'Could not reach Urganize. Check your connection.' };
  }
}
