import { getAccessToken } from '@/components/settings/getAccessToken';
import type { NextRecord, RecordSession, SessionStatus } from '@/lib/next-records';

// Browser calls for Home's next-record asks (2026-10-27, step 3). Each answer
// goes through the record routes that already exist; only the snooze is new.

type Done<T> = { ok: true; value: T } | { ok: false; error: string };

async function send(path: string, method: string, body: unknown): Promise<Done<Record<string, unknown>>> {
  try {
    const token = await getAccessToken();
    const response = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) return { ok: false, error: typeof payload.error === 'string' ? payload.error : 'Something went wrong. Try again.' };
    return { ok: true, value: payload };
  } catch {
    return { ok: false, error: 'Could not reach Urganize. Check your connection.' };
  }
}

/** "What's next?" answered: starts the record with the line as its idea. */
export async function startRecordWithIdea(artistId: string, idea: string): Promise<Done<NextRecord>> {
  const result = await send(`/api/workspace/artists/${artistId}/records`, 'POST', { idea });
  if (!result.ok) return result;
  const record = result.value.record as NextRecord | undefined;
  return record ? { ok: true, value: record } : { ok: false, error: 'Something went wrong. Try again.' };
}

export async function snoozeWhatsNext(artistId: string): Promise<Done<null>> {
  const result = await send(`/api/workspace/artists/${artistId}/records/snooze`, 'POST', {});
  return result.ok ? { ok: true, value: null } : result;
}

/**
 * "Did it happen?" answered. The PUT replaces the whole session, so the rest of
 * it (people, songs, note) goes back unchanged. Moved keeps it planned on its
 * new day (or words), so it is "Next" again and asked about after that day.
 */
export async function answerSession(
  recordId: string,
  session: RecordSession,
  answer: { status: Exclude<SessionStatus, 'planned' | 'moved'> } | { status: 'moved'; date: string | null; dateHint: string }
): Promise<Done<null>> {
  const body = {
    date: answer.status === 'moved' ? answer.date : session.date,
    dateHint: answer.status === 'moved' ? answer.dateHint : session.dateHint,
    status: answer.status === 'moved' ? 'planned' : answer.status,
    note: session.note,
    people: session.people,
    songIds: session.songIds,
  };
  const result = await send(`/api/records/${recordId}/sessions/${session.id}`, 'PUT', body);
  return result.ok ? { ok: true, value: null } : result;
}
