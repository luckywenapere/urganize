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
