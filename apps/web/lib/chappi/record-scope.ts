// The record the UrgAns box is looking at (next record v2, Oyin, 27 Oct 2026,
// decision 6). There is no separate capture box on the record page: the app's
// own UrgAns box knows you are on a record, says "Tell UrgAns what happened…",
// and add_to_record files into that record. Pure and client-safe.
//
// The id comes from the page's address, never from anything typed. On a phone
// the box sends from the record page into the UrgAns tab, so the id rides in
// the chat store (scopedRecordId) for that hand-over. The server treats it as
// advice only: recordScopePrompt checks the record is the caller's before
// UrgAns hears about it, and the tool checks again on every call.

import { isUuid } from '@/lib/next-records';

export const RECORD_CAPTURE_PLACEHOLDER = 'Tell UrgAns what happened…';

const RECORD_PATH = /^\/dashboard\/artists\/[^/]+\/records\/([^/?#]+)\/?$/;

/** The record id when the page is a record page, else null. */
export function recordIdFromPath(pathname: string | null | undefined): string | null {
  const match = (pathname ?? '').match(RECORD_PATH);
  return match && isUuid(match[1]) ? match[1] : null;
}

/** The request body's recordScope, shape-checked. */
export function parseRecordScope(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const scope = (body as { recordScope?: unknown }).recordScope;
  if (!scope || typeof scope !== 'object') return null;
  const id = (scope as { id?: unknown }).id;
  return isUuid(id) ? id : null;
}

/** The line UrgAns reads when the box is on a record. */
export function recordScopeLine(record: { id: string; title: string; artistName: string }): string {
  return `The user is on the record "${record.title}" by ${record.artistName} (recordId: ${record.id}), which is still being made. When they say what happened or what is planned (sessions, who was there, songs and their stages), call add_to_record with this recordId. Unless they clearly name another record, questions are about this one.`;
}
