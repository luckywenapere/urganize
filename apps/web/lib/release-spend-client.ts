import { getAccessToken } from '@/components/content-calendar/get-access-token';
import type { Payback, SpendLine } from '@/lib/release-spend';
import type { SpendPayload, SpendSummary } from '@/lib/release-spend-server';

/**
 * The browser's side of release spend: one small function per route, each
 * answering `{ ok, value }` or `{ ok: false, error }` so a screen never has to
 * handle a thrown fetch. Nothing here is cached: spend is money, and a stale
 * total painted over a fresh edit is worse than a moment of loading.
 */

export type SpendResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** What the form holds: everything is text until the server parses it. */
export type SpendFormValues = {
  category: string;
  amountNaira: string;
  paidTo: string;
  spentOn: string;
  taskId: string;
  note: string;
};

const SESSION_ENDED = 'Your session expired. Sign in again.';
const OFFLINE = 'Could not reach the server. Check your connection and try again.';
const FALLBACK = 'Could not do that. Try again.';

async function call<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown } = {}
): Promise<SpendResult<T>> {
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: SESSION_ENDED };
    const response = await fetch(path, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) return { ok: false, error: String(body?.error || FALLBACK) };
    return { ok: true, value: body as T };
  } catch {
    return { ok: false, error: OFFLINE };
  }
}

/** A blank field is "not given". The server trims and decides what is valid. */
function bodyFrom(values: SpendFormValues): Record<string, unknown> {
  return {
    category: values.category,
    amountNaira: values.amountNaira,
    paidTo: values.paidTo,
    spentOn: values.spentOn,
    taskId: values.taskId,
    note: values.note,
  };
}

export const loadSpend = (releaseId: string) => call<SpendPayload>(`/api/releases/${releaseId}/spend`);

export async function addSpendLine(releaseId: string, values: SpendFormValues): Promise<SpendResult<SpendLine>> {
  const result = await call<{ line: SpendLine }>(`/api/releases/${releaseId}/spend`, {
    method: 'POST',
    body: bodyFrom(values),
  });
  return result.ok ? { ok: true, value: result.value.line } : result;
}

/** An edit sends every field the form holds. Blank optional fields clear them
 *  (null), which is what an edited-to-empty note or task means. */
export async function changeSpendLine(
  releaseId: string,
  lineId: string,
  values: SpendFormValues
): Promise<SpendResult<SpendLine>> {
  const result = await call<{ line: SpendLine }>(`/api/releases/${releaseId}/spend/${lineId}`, {
    method: 'PATCH',
    body: {
      category: values.category,
      amountNaira: values.amountNaira,
      spentOn: values.spentOn,
      paidTo: values.paidTo.trim() ? values.paidTo : null,
      taskId: values.taskId || null,
      note: values.note.trim() ? values.note : null,
    },
  });
  return result.ok ? { ok: true, value: result.value.line } : result;
}

export async function removeSpendLine(releaseId: string, lineId: string): Promise<SpendResult<true>> {
  const result = await call<{ ok: true }>(`/api/releases/${releaseId}/spend/${lineId}`, { method: 'DELETE' });
  return result.ok ? { ok: true, value: true } : result;
}

export async function savePaybackAnswer(
  releaseId: string,
  input: { amountNaira: string; note: string }
): Promise<SpendResult<Payback>> {
  const result = await call<{ payback: Payback }>(`/api/releases/${releaseId}/spend/payback`, {
    method: 'PUT',
    body: { amountNaira: input.amountNaira, note: input.note },
  });
  return result.ok ? { ok: true, value: result.value.payback } : result;
}

export async function loadSpendSummaryFromApi(): Promise<SpendResult<SpendSummary>> {
  const result = await call<{ summary: SpendSummary }>('/api/spend/summary');
  return result.ok ? { ok: true, value: result.value.summary } : result;
}
