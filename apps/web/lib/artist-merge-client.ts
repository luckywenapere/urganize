import { getAccessToken } from '@/components/settings/getAccessToken';
import type { DuplicatePair } from '@/lib/artist-merge';

// Browser side of joining duplicate artists (#865). Lives in lib because
// components must not name the API's path segment (house-copy ratchet).

const DUPLICATES_URL = '/api/workspace/artists/duplicates';

/** The pairs to ask this person about. Empty on any failure, or when they are not an admin. */
export async function fetchDuplicatePairs(): Promise<DuplicatePair[]> {
  try {
    const token = await getAccessToken();
    const response = await fetch(DUPLICATES_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return [];
    const payload = (await response.json()) as { pairs?: DuplicatePair[] };
    return Array.isArray(payload.pairs) ? payload.pairs : [];
  } catch {
    return [];
  }
}

/** Joins drop into keep, or remembers they are different. Returns an error sentence, or null. */
export async function answerDuplicatePair(
  pair: DuplicatePair,
  answer: 'join' | 'dismiss'
): Promise<string | null> {
  const body =
    answer === 'join'
      ? { action: 'join', keepId: pair.keep.id, dropId: pair.drop.id }
      : { action: 'dismiss', a: pair.keep.id, b: pair.drop.id };
  try {
    const token = await getAccessToken();
    const response = await fetch(DUPLICATES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    return payload.error ?? 'Could not save that. Try again.';
  } catch {
    return 'Could not save that. Try again.';
  }
}
