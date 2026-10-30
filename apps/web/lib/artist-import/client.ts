import { getAccessToken } from '@/components/settings/getAccessToken';

export type CatalogueRow = {
  id: string;
  title: string;
  kind: 'single' | 'ep' | 'album';
  release_date: string | null;
  cover_url: string | null;
  url: string | null;
  source: 'deezer' | 'itunes';
  upc: string | null;
  isrc: string | null;
  /** Null for a Deezer release whose codes are still being looked up. */
  codes_checked_at: string | null;
  link: { url: string | null } | null;
};

export type LinkCap = { allowed: boolean; limit: number; used: number; remaining: number };

/** The streaming profile an artist's older music came from (#882); null until brought in. */
export type CatalogueProfile = { source: 'deezer' | 'itunes'; syncedAt: string | null };

export type Catalogue = {
  releases: CatalogueRow[];
  cap: LinkCap | null;
  codesPending: number;
  profile: CatalogueProfile | null;
  /** False until the first read answers, so the page can tell empty from loading. */
  loaded: boolean;
};

const EMPTY_CATALOGUE: Catalogue = { releases: [], cap: null, codesPending: 0, profile: null, loaded: true };

/** An artist's imported catalogue with codes, links and today's link count. Empty on any failure. */
export async function fetchArtistCatalogue(artistId: string): Promise<Catalogue> {
  try {
    const token = await getAccessToken();
    const response = await fetch(`/api/workspace/artists/${artistId}/catalogue`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return EMPTY_CATALOGUE;
    const payload = (await response.json()) as Partial<Catalogue>;
    return {
      releases: payload.releases ?? [],
      cap: payload.cap ?? null,
      codesPending: payload.codesPending ?? 0,
      profile: payload.profile ?? null,
      loaded: true,
    };
  } catch {
    return EMPTY_CATALOGUE;
  }
}

export type MadeLink =
  | { ok: true; url: string | null; cap: LinkCap | null }
  | { ok: false; reason: 'cap' | 'no_code' | 'busy' | 'unavailable' | 'rate_limited' | 'failed'; message: string; cap: LinkCap | null };

/** Makes the Altlink link for one imported release (the person has confirmed already). */
export async function requestCatalogueLink(artistId: string, releaseId: string): Promise<MadeLink> {
  try {
    const token = await getAccessToken();
    const response = await fetch(`/api/workspace/artists/${artistId}/catalogue/${releaseId}/link`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) {
      return { ok: true, url: typeof payload.url === 'string' ? payload.url : null, cap: (payload.cap as LinkCap | undefined) ?? null };
    }
    const reason = typeof payload.reason === 'string' ? payload.reason : 'failed';
    const known = ['cap', 'no_code', 'busy', 'unavailable', 'rate_limited'];
    return {
      ok: false,
      reason: (known.includes(reason) ? reason : 'failed') as Exclude<MadeLink, { ok: true }>['reason'],
      message: typeof payload.error === 'string' ? payload.error : 'Could not make the link. Try again.',
      cap: (payload.cap as LinkCap | undefined) ?? null,
    };
  } catch {
    return { ok: false, reason: 'failed', message: 'Could not make the link. Try again.', cap: null };
  }
}

/** Saves a UPC or ISRC typed by hand. Returns an error sentence, or null when saved. */
export async function saveReleaseCode(artistId: string, releaseId: string, code: string): Promise<string | null> {
  try {
    const token = await getAccessToken();
    const response = await fetch(`/api/workspace/artists/${artistId}/catalogue/${releaseId}/codes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    });
    if (response.ok) return null;
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    return payload.error ?? 'Could not save the code.';
  } catch {
    return 'Could not save the code.';
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
  /** A roster artist to put the releases on, instead of matching by name. */
  artistId?: string;
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
