// Bring your notes: checks what the browser sends to be saved. Shared by the
// commit route and its test, so the limits live in one place.

import { MAX_NOTE_BODY_LENGTH } from '@/lib/notes';
import { MAX_IMPORT_ITEMS, type ImportSource } from './build';

export type CommitItem = { body: string; releaseId: string | null; at: string | null };

export type CommitPayload = { source: ImportSource; items: CommitItem[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A written-at time must be real and not in the future; anything else becomes "now". */
function cleanAt(value: unknown, now: number): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  if (Number.isNaN(time) || time > now) return null;
  return new Date(time).toISOString();
}

export function parseCommitPayload(
  payload: unknown,
  now: number = Date.now()
): { ok: true; value: CommitPayload } | { ok: false; error: string } {
  if (typeof payload !== 'object' || payload === null) return { ok: false, error: 'Nothing to save.' };
  const record = payload as Record<string, unknown>;
  const source: ImportSource =
    record.source === 'whatsapp' ? 'whatsapp' : record.source === 'photo' ? 'photo' : 'text';
  if (!Array.isArray(record.items) || record.items.length === 0) {
    return { ok: false, error: 'Choose at least one note to keep.' };
  }
  if (record.items.length > MAX_IMPORT_ITEMS) {
    return { ok: false, error: `Keep ${MAX_IMPORT_ITEMS} notes or fewer at a time.` };
  }

  const items: CommitItem[] = [];
  for (const raw of record.items) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'A note was not readable.' };
    const entry = raw as Record<string, unknown>;
    if (typeof entry.body !== 'string' || !entry.body.trim()) {
      return { ok: false, error: 'A note was empty.' };
    }
    if (entry.body.length > MAX_NOTE_BODY_LENGTH) return { ok: false, error: 'A note was too long.' };
    let releaseId: string | null = null;
    if (entry.releaseId !== null && entry.releaseId !== undefined) {
      if (typeof entry.releaseId !== 'string' || !UUID.test(entry.releaseId)) {
        return { ok: false, error: 'A rollout id was not valid.' };
      }
      releaseId = entry.releaseId;
    }
    items.push({ body: entry.body, releaseId, at: cleanAt(entry.at, now) });
  }
  return { ok: true, value: { source, items } };
}
