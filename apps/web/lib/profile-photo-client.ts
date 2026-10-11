'use client';

import { supabase } from '@/lib/supabase/client';

// Save calls for ProfilePhotoPicker. Each resolves to the new signed URL (null
// after a removal) and throws a sentence a person can read.

async function patchJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to change the photo.');
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not save the photo.');
  }
  return payload;
}

export const artistPhotoUrl = (artistId: string): string =>
  `/api/workspace/artists/${encodeURIComponent(artistId)}/photo`;

export async function saveArtistPhoto(artistId: string, photoPath: string | null): Promise<string | null> {
  const payload = await patchJson(artistPhotoUrl(artistId), { photoPath });
  const artist = (payload.artist || {}) as { photoUrl?: unknown };
  return typeof artist.photoUrl === 'string' ? artist.photoUrl : null;
}

export const PERSON_PHOTO_SIGN_URL = '/api/directory/profile/photo';
