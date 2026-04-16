import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { RELEASE_METADATA_TABLE } from '@/lib/release-ops';
import {
  buildAbsoluteListenUrl,
  getShareLinkStatus,
  parseDurationSeconds,
  sanitizeWaveformData,
  TRACK_SIGNED_URL_TTL_SECONDS,
  TRACK_STORAGE_BUCKET,
  type ListenPageData,
  type ShareLink,
  type Track,
  type TrackWaveformData,
} from '@/lib/tracks';

export const TRACKS_TABLE = 'tracks';
export const SHARE_LINKS_TABLE = 'share_links';
export const TRACK_LISTEN_RATE_LIMIT_MAX_REQUESTS = 60;
export const TRACK_LISTEN_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export const TRACKS_SQL = [
  'create extension if not exists pgcrypto;',
  '',
  'do $$ begin',
  "  create type public.track_status as enum ('processing', 'ready', 'error');",
  'exception',
  '  when duplicate_object then null;',
  'end $$;',
  '',
  'create table if not exists public.tracks (',
  '  id uuid primary key default gen_random_uuid(),',
  '  release_id uuid null references public.releases(id) on delete set null,',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  title text not null,',
  '  file_url text not null,',
  '  file_size integer not null default 0,',
  '  duration_seconds integer null,',
  '  mime_type text not null,',
  "  waveform_data jsonb null default '[]'::jsonb,",
  "  status public.track_status not null default 'processing',",
  '  position integer not null default 1,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'alter table public.tracks add column if not exists release_id uuid null references public.releases(id) on delete set null;',
  'alter table public.tracks add column if not exists file_size integer not null default 0;',
  'alter table public.tracks add column if not exists duration_seconds integer null;',
  'alter table public.tracks add column if not exists mime_type text not null default \'audio/mpeg\';',
  'alter table public.tracks add column if not exists waveform_data jsonb null default \'[]\'::jsonb;',
  'alter table public.tracks add column if not exists status public.track_status not null default \'processing\';',
  'alter table public.tracks add column if not exists position integer not null default 1;',
  'alter table public.tracks add column if not exists updated_at timestamptz not null default now();',
  '',
  'create index if not exists tracks_release_id_idx on public.tracks(release_id, position asc, created_at asc);',
  'create index if not exists tracks_user_id_idx on public.tracks(user_id, created_at desc);',
  '',
  'create table if not exists public.share_links (',
  '  id uuid primary key default gen_random_uuid(),',
  '  track_id uuid not null references public.tracks(id) on delete cascade,',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  token text not null unique,',
  '  label text null,',
  '  expires_at timestamptz null,',
  '  play_count integer not null default 0,',
  '  is_revoked boolean not null default false,',
  '  created_at timestamptz not null default now()',
  ');',
  '',
  'alter table public.share_links add column if not exists label text null;',
  'alter table public.share_links add column if not exists expires_at timestamptz null;',
  'alter table public.share_links add column if not exists play_count integer not null default 0;',
  'alter table public.share_links add column if not exists is_revoked boolean not null default false;',
  '',
  'create index if not exists share_links_track_id_idx on public.share_links(track_id, created_at desc);',
  'create index if not exists share_links_user_id_idx on public.share_links(user_id, created_at desc);',
  'create index if not exists share_links_token_idx on public.share_links(token);',
  '',
  'alter table public.tracks enable row level security;',
  'alter table public.share_links enable row level security;',
  '',
  "insert into storage.buckets (id, name, public)",
  `values ('${TRACK_STORAGE_BUCKET}', '${TRACK_STORAGE_BUCKET}', false)`,
  'on conflict (id) do update set public = excluded.public;',
].join('\n');

export type TrackRecord = {
  id: string;
  release_id: string | null;
  user_id: string;
  title: string;
  file_url: string;
  file_size: number;
  duration_seconds: number | null;
  mime_type: string;
  waveform_data: unknown;
  status: 'processing' | 'ready' | 'error';
  position: number;
  created_at: string;
  updated_at: string;
};

export type ShareLinkRecord = {
  id: string;
  track_id: string;
  user_id: string;
  token: string;
  label: string | null;
  expires_at: string | null;
  play_count: number;
  is_revoked: boolean;
  created_at: string;
};

type ReleaseRecord = {
  id: string;
  title: string;
  artist_name: string;
  release_date: string | null;
};

type ReleaseMetadataRecord = {
  release_id: string;
  artwork_url: string | null;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

declare global {
  var __urganizeTrackListenRateLimitStore: Map<string, RateLimitEntry> | undefined;
}

export function isOptionalTableMissingError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();

  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('column') && message.includes('does not exist')) ||
    message.includes('track_status')
  );
}

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<{ user: User; supabaseUrl: string } | { error: NextResponse }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user, supabaseUrl };
}

export function getSupabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
}

export function createAdminClient(supabaseUrl: string): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export function buildMissingSchemaResponse(message = 'Tracks tables are missing.') {
  return NextResponse.json({ error: message, sql: TRACKS_SQL }, { status: 501 });
}

function normalizeWaveformData(value: unknown): TrackWaveformData | null {
  return sanitizeWaveformData(value);
}

export async function createSignedTrackUrl(
  adminClient: SupabaseClient,
  filePath: string
): Promise<{ signedUrl: string } | { error: NextResponse }> {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) {
    return {
      error: NextResponse.json({ error: 'Track file path is missing.' }, { status: 500 }),
    };
  }

  const { data, error } = await adminClient.storage
    .from(TRACK_STORAGE_BUCKET)
    .createSignedUrl(normalizedPath, TRACK_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return {
      error: NextResponse.json(
        { error: error?.message || 'Could not create a signed track URL.' },
        { status: 500 }
      ),
    };
  }

  return { signedUrl: data.signedUrl };
}

export function toTrack(row: TrackRecord, previewUrl: string | null = null): Track {
  return {
    id: row.id,
    releaseId: row.release_id || null,
    userId: row.user_id,
    title: row.title || '',
    fileUrl: row.file_url || '',
    fileSize: Number(row.file_size || 0),
    durationSeconds: parseDurationSeconds(row.duration_seconds),
    mimeType: row.mime_type || 'audio/mpeg',
    waveformData: normalizeWaveformData(row.waveform_data),
    status: row.status || 'processing',
    position: Number(row.position || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    previewUrl,
  };
}

export function toShareLink(
  row: ShareLinkRecord,
  origin?: string
): ShareLink {
  return {
    id: row.id,
    trackId: row.track_id,
    userId: row.user_id,
    token: row.token,
    label: row.label || null,
    expiresAt: row.expires_at || null,
    playCount: Number(row.play_count || 0),
    isRevoked: Boolean(row.is_revoked),
    createdAt: row.created_at,
    status: getShareLinkStatus({
      expiresAt: row.expires_at || null,
      isRevoked: Boolean(row.is_revoked),
    }),
    shareUrl: buildAbsoluteListenUrl(row.token, origin),
  };
}

export async function ensureTrackOwnership(
  adminClient: SupabaseClient,
  trackId: string,
  userId: string
): Promise<{ track: TrackRecord } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(TRACKS_TABLE)
    .select('id,release_id,user_id,title,file_url,file_size,duration_seconds,mime_type,waveform_data,status,position,created_at,updated_at')
    .eq('id', trackId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json({ error: error.message || 'Could not load track.' }, { status: 500 }),
    };
  }

  if (!data) {
    return { error: NextResponse.json({ error: 'Track not found.' }, { status: 404 }) };
  }

  return { track: data as TrackRecord };
}

export async function ensureShareLinkOwnership(
  adminClient: SupabaseClient,
  shareLinkId: string,
  userId: string
): Promise<{ shareLink: ShareLinkRecord } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(SHARE_LINKS_TABLE)
    .select('id,track_id,user_id,token,label,expires_at,play_count,is_revoked,created_at')
    .eq('id', shareLinkId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load share link.' },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return { error: NextResponse.json({ error: 'Share link not found.' }, { status: 404 }) };
  }

  return { shareLink: data as ShareLinkRecord };
}

export async function loadTracksForRelease(
  adminClient: SupabaseClient,
  releaseId: string
): Promise<{ tracks: Track[] } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(TRACKS_TABLE)
    .select('id,release_id,user_id,title,file_url,file_size,duration_seconds,mime_type,waveform_data,status,position,created_at,updated_at')
    .eq('release_id', releaseId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json({ error: error.message || 'Could not load tracks.' }, { status: 500 }),
    };
  }

  const rows = Array.isArray(data) ? (data as TrackRecord[]) : [];
  const tracks: Track[] = [];

  for (const row of rows) {
    const signedResult = await createSignedTrackUrl(adminClient, row.file_url);
    if ('error' in signedResult) {
      return signedResult;
    }

    tracks.push(toTrack(row, signedResult.signedUrl));
  }

  return { tracks };
}

export async function loadShareLinksForTrack(
  adminClient: SupabaseClient,
  trackId: string,
  origin?: string
): Promise<{ shareLinks: ShareLink[] } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(SHARE_LINKS_TABLE)
    .select('id,track_id,user_id,token,label,expires_at,play_count,is_revoked,created_at')
    .eq('track_id', trackId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load share links.' },
        { status: 500 }
      ),
    };
  }

  return {
    shareLinks: (Array.isArray(data) ? (data as ShareLinkRecord[]) : []).map((row) =>
      toShareLink(row, origin)
    ),
  };
}

export async function revokeShareLinksForTrack(
  adminClient: SupabaseClient,
  trackId: string
): Promise<{ ok: true } | { error: NextResponse }> {
  const { error } = await adminClient
    .from(SHARE_LINKS_TABLE)
    .update({ is_revoked: true })
    .eq('track_id', trackId);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not revoke share links.' },
        { status: 500 }
      ),
    };
  }

  return { ok: true };
}

export async function removeTrackFromStorage(
  adminClient: SupabaseClient,
  filePath: string
): Promise<{ ok: true } | { error: NextResponse }> {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) {
    return { ok: true };
  }

  const { error } = await adminClient.storage
    .from(TRACK_STORAGE_BUCKET)
    .remove([normalizedPath]);

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not remove the uploaded track.' },
        { status: 500 }
      ),
    };
  }

  return { ok: true };
}

export async function loadTrackByShareToken(
  adminClient: SupabaseClient,
  token: string,
  origin?: string
): Promise<
  | {
      shareLink: ShareLinkRecord;
      track: TrackRecord;
      release: ReleaseRecord | null;
      artworkUrl: string | null;
      data: ListenPageData;
    }
  | { error: NextResponse }
> {
  const { data: shareLinkData, error: shareLinkError } = await adminClient
    .from(SHARE_LINKS_TABLE)
    .select('id,track_id,user_id,token,label,expires_at,play_count,is_revoked,created_at')
    .eq('token', token)
    .maybeSingle();

  if (shareLinkError) {
    if (isOptionalTableMissingError(shareLinkError)) {
      return { error: buildMissingSchemaResponse('Tracks tables are missing.') };
    }

    return {
      error: NextResponse.json(
        { error: shareLinkError.message || 'Could not validate the share link.' },
        { status: 500 }
      ),
    };
  }

  const shareLink = (shareLinkData as ShareLinkRecord | null) || null;
  if (!shareLink) {
    return { error: NextResponse.json({ error: 'This link is no longer available.' }, { status: 404 }) };
  }

  const shareStatus = getShareLinkStatus({
    expiresAt: shareLink.expires_at || null,
    isRevoked: Boolean(shareLink.is_revoked),
  });
  if (shareStatus !== 'active') {
    return { error: NextResponse.json({ error: 'This link is no longer available.' }, { status: 410 }) };
  }

  const { data: trackData, error: trackError } = await adminClient
    .from(TRACKS_TABLE)
    .select('id,release_id,user_id,title,file_url,file_size,duration_seconds,mime_type,waveform_data,status,position,created_at,updated_at')
    .eq('id', shareLink.track_id)
    .maybeSingle();

  if (trackError) {
    if (isOptionalTableMissingError(trackError)) {
      return { error: buildMissingSchemaResponse('Tracks tables are missing.') };
    }

    return {
      error: NextResponse.json({ error: trackError.message || 'Could not load track.' }, { status: 500 }),
    };
  }

  const track = (trackData as TrackRecord | null) || null;
  if (!track || track.status !== 'ready') {
    return { error: NextResponse.json({ error: 'This link is no longer available.' }, { status: 404 }) };
  }

  const signedResult = await createSignedTrackUrl(adminClient, track.file_url);
  if ('error' in signedResult) {
    return signedResult;
  }

  let release: ReleaseRecord | null = null;
  let artworkUrl: string | null = null;

  if (track.release_id) {
    const { data: releaseData, error: releaseError } = await adminClient
      .from('releases')
      .select('id,title,artist_name,release_date')
      .eq('id', track.release_id)
      .maybeSingle();

    if (releaseError) {
      if (!isOptionalTableMissingError(releaseError)) {
        return {
          error: NextResponse.json(
            { error: releaseError.message || 'Could not load release information.' },
            { status: 500 }
          ),
        };
      }
    } else {
      release = (releaseData as ReleaseRecord | null) || null;
    }

    if (release) {
      const { data: releaseMetadataData, error: releaseMetadataError } = await adminClient
        .from(RELEASE_METADATA_TABLE)
        .select('release_id,artwork_url')
        .eq('release_id', release.id)
        .maybeSingle();

      if (releaseMetadataError) {
        if (!isOptionalTableMissingError(releaseMetadataError)) {
          return {
            error: NextResponse.json(
              { error: releaseMetadataError.message || 'Could not load release artwork.' },
              { status: 500 }
            ),
          };
        }
      } else {
        artworkUrl = String(
          ((releaseMetadataData as ReleaseMetadataRecord | null)?.artwork_url || '') || ''
        ).trim() || null;
      }
    }
  }

  const responseData: ListenPageData = {
    track: {
      id: track.id,
      title: track.title,
      artistName: release?.artist_name || 'Unknown Artist',
      releaseTitle: release?.title || null,
      durationSeconds: parseDurationSeconds(track.duration_seconds),
      waveformData: normalizeWaveformData(track.waveform_data),
      audioUrl: signedResult.signedUrl,
      artworkUrl,
      mimeType: track.mime_type || 'audio/mpeg',
    },
    shareLink: {
      id: shareLink.id,
      label: shareLink.label || null,
      expiresAt: shareLink.expires_at || null,
      playCount: Number(shareLink.play_count || 0) + 1,
    },
  };

  return {
    shareLink,
    track,
    release,
    artworkUrl,
    data: responseData,
  };
}

function getRateLimitStore(): Map<string, RateLimitEntry> {
  if (!globalThis.__urganizeTrackListenRateLimitStore) {
    globalThis.__urganizeTrackListenRateLimitStore = new Map<string, RateLimitEntry>();
  }

  return globalThis.__urganizeTrackListenRateLimitStore;
}

function cleanupRateLimitStore(store: Map<string, RateLimitEntry>) {
  if (store.size < 400) {
    return;
  }

  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function getRequestIp(request: NextRequest): string {
  const forwardedFor =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    '';

  const firstIp = forwardedFor.split(',')[0]?.trim();
  return firstIp || 'unknown';
}

export function checkTrackListenRateLimit(
  ipAddress: string
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const store = getRateLimitStore();
  cleanupRateLimitStore(store);

  const now = Date.now();
  const key = `listen:${ipAddress}`;
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + TRACK_LISTEN_RATE_LIMIT_WINDOW_MS,
    });
    return { ok: true };
  }

  if (current.count >= TRACK_LISTEN_RATE_LIMIT_MAX_REQUESTS) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  store.set(key, {
    count: current.count + 1,
    resetAt: current.resetAt,
  });

  return { ok: true };
}
