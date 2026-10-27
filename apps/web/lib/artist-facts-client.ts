import { getAccessToken } from '@/components/settings/getAccessToken';
import type { ArtistFact, ArtistFactTopic } from './artist-facts';

// The artist page's calls for what UrgAns remembers (lib/artist-facts.ts).

export type ArtistFactsPayload = { facts: ArtistFact[]; authors: Record<string, string>; me: string | null };

const base = (artistId: string) => `/api/workspace/artists/${encodeURIComponent(artistId)}/facts`;

async function call(path: string, init: { method: string; body?: unknown }) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, body };
}

export async function fetchArtistFacts(artistId: string): Promise<ArtistFactsPayload | null> {
  try {
    const res = await call(base(artistId), { method: 'GET' });
    if (!res.ok) return null;
    return {
      facts: (res.body.facts as ArtistFact[]) ?? [],
      authors: (res.body.authors as Record<string, string>) ?? {},
      me: typeof res.body.me === 'string' ? res.body.me : null,
    };
  } catch {
    return null;
  }
}

/** Add (no factId) or change one fact. Returns an error message, or null. */
export async function saveArtistFactByHand(
  artistId: string,
  input: { topic: ArtistFactTopic; value: string; factId?: string | null }
): Promise<string | null> {
  try {
    const res = input.factId
      ? await call(`${base(artistId)}/${encodeURIComponent(input.factId)}`, { method: 'PATCH', body: input })
      : await call(base(artistId), { method: 'POST', body: input });
    return res.ok ? null : String(res.body.error || 'Could not save that. Try again.');
  } catch {
    return 'Could not save that. Try again.';
  }
}

export async function removeArtistFact(artistId: string, factId: string): Promise<string | null> {
  try {
    const res = await call(`${base(artistId)}/${encodeURIComponent(factId)}`, { method: 'DELETE' });
    return res.ok ? null : String(res.body.error || 'Could not remove that. Try again.');
  } catch {
    return 'Could not remove that. Try again.';
  }
}
