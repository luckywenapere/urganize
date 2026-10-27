import { getAccessToken } from '@/components/settings/getAccessToken';
import type { ArtistPost, PostPlatform, PostStatus } from '@/lib/posting-plan';

// Browser calls for the posting plan (2026-10-27).

export type Poster = { userId: string; name: string };
export type ArtistPlan = { today: string; artistName: string; posts: ArtistPost[]; people: Poster[] };
export type TodayPost = ArtistPost & { artistName: string };
export type TodayPlan = {
  today: string;
  posts: TodayPost[];
  week?: { done: number; total: number };
  next?: TodayPost | null;
};

/** Fired after any change, so Home and the artist page stay in step. */
export const POSTING_PLAN_CHANGED_EVENT = 'urganize:posting-plan-changed';

async function call(path: string, init: { method: string; body?: unknown } = { method: 'GET' }) {
  const token = await getAccessToken();
  const response = await fetch(path, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Something went wrong. Try again.');
  return payload;
}

function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(POSTING_PLAN_CHANGED_EVENT));
}

export async function fetchArtistPlan(artistId: string): Promise<ArtistPlan> {
  return (await call(`/api/workspace/artists/${artistId}/posts`)) as unknown as ArtistPlan;
}

export async function fetchTodayPlan(): Promise<TodayPlan | null> {
  try {
    return (await call('/api/workspace/posts/today')) as unknown as TodayPlan;
  } catch {
    return null;
  }
}

export async function addPost(
  artistId: string,
  input: { what: string; postDay: string; platform: PostPlatform | null; ownerUserId: string | null }
): Promise<ArtistPost> {
  const payload = await call(`/api/workspace/artists/${artistId}/posts`, { method: 'POST', body: input });
  changed();
  return ((payload.posts as ArtistPost[]) ?? [])[0];
}

export async function setPostStatus(artistId: string, postId: string, status: PostStatus): Promise<ArtistPost> {
  const payload = await call(`/api/workspace/artists/${artistId}/posts/${postId}`, { method: 'PATCH', body: { status } });
  changed();
  return payload.post as ArtistPost;
}

export async function removePost(artistId: string, postId: string): Promise<void> {
  await call(`/api/workspace/artists/${artistId}/posts/${postId}`, { method: 'DELETE' });
  changed();
}
