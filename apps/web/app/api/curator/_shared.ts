import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  MAX_CURATOR_BIO_LENGTH,
  MAX_CURATOR_DISPLAY_NAME_LENGTH,
  MAX_PITCH_REPLY_LENGTH,
  MAX_PLAYLIST_NAME_LENGTH,
  MAX_PLAYLIST_URL_LENGTH,
  isPitchPlatform,
  normalizeGenreTags,
} from '@/lib/pitching';
import type { CuratorPitch, CuratorPlaylist, PitchPlatform } from '@/types/pitching';

// Shared helpers for the curator route group: table constants, the feature
// flag check, row mappers, validators, and the curator auth gate.
//
// No schema-missing fallback here on purpose: environments are assumed
// migrated (CLAUDE.md "Patterns being deprecated in v1"); a missing table
// surfaces as a normal 500.

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here so
// the curator route import sites stay stable (the releases/_shared.ts
// convention).
export { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';

export const CURATOR_INVITES_TABLE = 'curator_invites';
export const CURATOR_PROFILES_TABLE = 'curator_profiles';
export const CURATOR_PLAYLISTS_TABLE = 'curator_playlists';
export const PITCHES_TABLE = 'playlist_pitches';

export const CURATOR_PROFILE_COLUMNS =
  'user_id,display_name,bio,photo_path,created_at,updated_at';

export const CURATOR_PLAYLIST_COLUMNS =
  'id,name,platform,genres,follower_count,url,created_at,updated_at';

export const CURATOR_PITCH_COLUMNS =
  'id,playlist_name,song_title,artist_name,pitcher_name,song_url,song_platform,note,status,curator_reply,created_at,updated_at';

/** A curator's own list caps. Well above any real inventory or inbox. */
export const CURATOR_PLAYLIST_LIST_LIMIT = 100;
export const CURATOR_PITCH_LIST_LIMIT = 200;

/** How long a signed photo URL lives. Matches the release-asset TTL. */
export const CURATOR_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60;

// Curator photos live in the existing private release-assets bucket (the
// workspace-logo precedent). RELEASE_ASSETS_BUCKET in lib/asset-constants.ts is
// the one source of truth for that name; nothing here redeclares it.

/**
 * Feature flag: the whole pitching surface, both sides, stays dark until
 * NEXT_PUBLIC_FEATURE_PITCHING is 'true'. Every handler checks this first and
 * 404s when off, so direct API calls cannot reach the feature either (the
 * notes / EPK route precedent). The pages check the same flag and bounce.
 */
export const isPitchingFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

export const flagOffResponse = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

/** The storage path prefix a given curator's photos must live under. */
export const curatorPhotoPathPrefix = (userId: string) => `curator/${userId}/photo/`;

/**
 * Auth gate for every curator route.
 *
 * Deliberately NOT requireActiveAuthenticatedUser: pitching is free, and a
 * curator has no subscription, so running them through the payment gate would
 * lock them out the moment that gate is switched back on. Curators are also
 * kept off requireAuthenticatedAdmin for the same reason.
 *
 * Returns 403 (not 404) when the account is not a curator: the caller is
 * authenticated and the route exists, they simply are not this kind of user,
 * and the client uses that signal to redirect them to their own home.
 */
export async function requireCuratorUser(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return { error: auth.error };

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message || 'Could not load your account.' }, { status: 500 }) };
  }

  if (String(profile?.role || '') !== 'curator') {
    return {
      error: NextResponse.json({ error: 'This is only for playlist owners.' }, { status: 403 }),
    };
  }

  return { user: auth.user, supabaseUrl: auth.supabaseUrl, adminClient };
}

export const toCuratorPlaylist = (row: Record<string, unknown>): CuratorPlaylist => ({
  id: String(row.id || ''),
  name: typeof row.name === 'string' ? row.name : '',
  platform: isPitchPlatform(row.platform) ? row.platform : 'other',
  genres: Array.isArray(row.genres) ? row.genres.map((tag) => String(tag)) : [],
  followerCount: typeof row.follower_count === 'number' ? row.follower_count : null,
  url: typeof row.url === 'string' ? row.url : '',
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

export const toCuratorPitch = (row: Record<string, unknown>): CuratorPitch => ({
  id: String(row.id || ''),
  playlistName: typeof row.playlist_name === 'string' ? row.playlist_name : '',
  songTitle: typeof row.song_title === 'string' ? row.song_title : '',
  artistName: typeof row.artist_name === 'string' ? row.artist_name : '',
  pitcherName: typeof row.pitcher_name === 'string' ? row.pitcher_name : '',
  songUrl: typeof row.song_url === 'string' ? row.song_url : '',
  songPlatform: isPitchPlatform(row.song_platform) ? row.song_platform : null,
  note: typeof row.note === 'string' ? row.note : '',
  status:
    row.status === 'listened' || row.status === 'added' || row.status === 'passed'
      ? row.status
      : 'new',
  reply: typeof row.curator_reply === 'string' && row.curator_reply ? row.curator_reply : null,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

type TextFieldRules = { label: string; max: number; required: boolean };

/**
 * One validator for every short text field on this side, so the error copy
 * stays consistent and no route invents its own phrasing.
 */
export function parseTextField(
  value: unknown,
  rules: TextFieldRules
): { error: NextResponse } | { value: string } {
  if (typeof value !== 'string') {
    return {
      error: NextResponse.json({ error: `${rules.label} must be text.` }, { status: 400 }),
    };
  }
  const trimmed = value.trim();
  if (rules.required && !trimmed) {
    return { error: NextResponse.json({ error: `${rules.label} is required.` }, { status: 400 }) };
  }
  if (trimmed.length > rules.max) {
    return {
      error: NextResponse.json(
        { error: `${rules.label} is too long. Keep it under ${rules.max} characters.` },
        { status: 400 }
      ),
    };
  }
  return { value: trimmed };
}

export const parseDisplayName = (value: unknown) =>
  parseTextField(value, { label: 'Display name', max: MAX_CURATOR_DISPLAY_NAME_LENGTH, required: true });

export const parseBio = (value: unknown) =>
  parseTextField(value, { label: 'Bio', max: MAX_CURATOR_BIO_LENGTH, required: false });

export const parsePlaylistName = (value: unknown) =>
  parseTextField(value, { label: 'Playlist name', max: MAX_PLAYLIST_NAME_LENGTH, required: true });

export const parseReply = (value: unknown) =>
  parseTextField(value, { label: 'Reply', max: MAX_PITCH_REPLY_LENGTH, required: false });

/** Playlist links must be real http(s) URLs so a pitcher can open them. */
export function parsePlaylistUrl(value: unknown): { error: NextResponse } | { value: string } {
  const parsed = parseTextField(value, {
    label: 'Playlist link',
    max: MAX_PLAYLIST_URL_LENGTH,
    required: true,
  });
  if ('error' in parsed) return parsed;
  let url: URL;
  try {
    url = new URL(parsed.value);
  } catch {
    return {
      error: NextResponse.json(
        { error: 'Playlist link must be a full web address starting with https.' },
        { status: 400 }
      ),
    };
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
    return {
      error: NextResponse.json(
        { error: 'Playlist link must be a full web address starting with https.' },
        { status: 400 }
      ),
    };
  }
  return { value: parsed.value };
}

export function parsePlatform(value: unknown): { error: NextResponse } | { value: PitchPlatform } {
  if (!isPitchPlatform(value)) {
    return { error: NextResponse.json({ error: 'Pick a platform.' }, { status: 400 }) };
  }
  return { value };
}

/**
 * Follower count is self-reported, so it may be absent. A non-integer or
 * negative number is a client bug worth a 400 rather than a silent zero.
 */
export function parseFollowerCount(value: unknown): { error: NextResponse } | { value: number | null } {
  if (value === null || value === undefined || value === '') return { value: null };
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
    return {
      error: NextResponse.json({ error: 'Follower count must be a whole number.' }, { status: 400 }),
    };
  }
  return { value: count };
}

export const parseGenres = (value: unknown): string[] => normalizeGenreTags(value);
