import { getAccessToken } from '@/components/settings/getAccessToken';
import type { NextRecord, RecordSummary, SessionInput, SongStage } from '@/lib/next-records';

// Browser calls for the next record (2026-10-27). Every write answers with the
// whole fresh record, so the page just swaps it in.

export type RecordCall = { ok: true; record: NextRecord } | { ok: false; error: string };

async function call(path: string, method: string, body?: unknown): Promise<Response> {
  const token = await getAccessToken();
  return fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function recordCall(path: string, method: string, body?: unknown): Promise<RecordCall> {
  try {
    const response = await call(path, method, body);
    const payload = (await response.json().catch(() => ({}))) as { record?: NextRecord; error?: string };
    if (!response.ok || !payload.record) return { ok: false, error: payload.error || 'Something went wrong. Try again.' };
    return { ok: true, record: payload.record };
  } catch {
    return { ok: false, error: 'Could not reach Urganize. Check your connection.' };
  }
}

/** Records in the making for one artist. Null when they could not be read. */
export async function fetchArtistRecords(artistId: string): Promise<RecordSummary[] | null> {
  try {
    const response = await call(`/api/workspace/artists/${artistId}/records`, 'GET');
    if (!response.ok) return null;
    const payload = (await response.json()) as { records?: RecordSummary[] };
    return payload.records ?? [];
  } catch {
    return null;
  }
}

export const startRecord = (artistId: string, input: { title?: string } = {}) =>
  recordCall(`/api/workspace/artists/${artistId}/records`, 'POST', input);

export const fetchRecord = (recordId: string) => recordCall(`/api/records/${recordId}`, 'GET');

export const patchRecord = (
  recordId: string,
  patch: Partial<{ title: string; kind: NextRecord['kind']; idea: string; status: 'making' | 'dropped' }>
) => recordCall(`/api/records/${recordId}`, 'PATCH', patch);

export const addRecordSong = (recordId: string, title: string) =>
  recordCall(`/api/records/${recordId}/songs`, 'POST', { title });

export const patchRecordSong = (recordId: string, songId: string, patch: Partial<{ title: string; stage: SongStage }>) =>
  recordCall(`/api/records/${recordId}/songs/${songId}`, 'PATCH', patch);

export const removeRecordSong = (recordId: string, songId: string) =>
  recordCall(`/api/records/${recordId}/songs/${songId}`, 'DELETE');

export const saveRecordSession = (recordId: string, sessionId: string | null, input: SessionInput) =>
  sessionId
    ? recordCall(`/api/records/${recordId}/sessions/${sessionId}`, 'PUT', input)
    : recordCall(`/api/records/${recordId}/sessions`, 'POST', input);

export const removeRecordSession = (recordId: string, sessionId: string) =>
  recordCall(`/api/records/${recordId}/sessions/${sessionId}`, 'DELETE');

export type ContactOption = { personId: string; label: string; role: string };

/** The team's contacts, for picking people. Empty when they are not available. */
export async function fetchContactOptions(): Promise<ContactOption[]> {
  try {
    const response = await call('/api/relationships', 'GET');
    if (!response.ok) return [];
    const payload = (await response.json()) as { relationships?: ContactOption[] };
    return (payload.relationships ?? []).map(({ personId, label, role }) => ({ personId, label, role }));
  } catch {
    return [];
  }
}
