import { getAccessToken } from '@/components/settings/getAccessToken';

export type CatalogueRow = {
  id: string;
  title: string;
  kind: 'single' | 'ep' | 'album';
  release_date: string | null;
  cover_url: string | null;
  url: string | null;
};

/** An artist's imported catalogue, newest first. Empty on any failure. */
export async function fetchArtistCatalogue(artistId: string): Promise<CatalogueRow[]> {
  try {
    const token = await getAccessToken();
    const response = await fetch(`/api/workspace/artists/${artistId}/catalogue`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { releases?: CatalogueRow[] };
    return payload.releases ?? [];
  } catch {
    return [];
  }
}

/** What the artist page and the Artists list listen for to refresh after an import. */
export const CATALOGUE_CHANGED_EVENT = 'urganize:catalogue-changed';

export type SavedImport =
  | { ok: true; artistId: string; artistName: string; added: number; total: number; createdArtist: boolean }
  | { ok: false; message: string };

/** Saves an artist and their releases onto the signed-in team (POST /api/artist-import). */
export async function saveArtistImport(input: {
  provider: 'deezer' | 'itunes';
  id: string;
  name: string;
}): Promise<SavedImport> {
  try {
    const token = await getAccessToken();
    const response = await fetch('/api/artist-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return { ok: false, message: typeof payload.error === 'string' ? payload.error : 'Could not import the artist.' };
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CATALOGUE_CHANGED_EVENT));
    return {
      ok: true,
      artistId: String(payload.artistId ?? ''),
      artistName: String(payload.artistName ?? input.name),
      added: Number(payload.added ?? 0),
      total: Number(payload.total ?? 0),
      createdArtist: payload.createdArtist === true,
    };
  } catch {
    return { ok: false, message: 'Could not import the artist.' };
  }
}
