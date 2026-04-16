import { NextRequest, NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { RELEASE_METADATA_TABLE } from '@/lib/release-ops';
import {
  buildCampaignSlugBase,
  normalizeStreamingLinks,
  type PreSaveCampaign,
  type PreSaveReleaseOption,
  type PreSaveStreamingLinks,
  type PublicPreSaveCampaign,
} from '@/lib/pre-save';

export const PRE_SAVE_CAMPAIGNS_TABLE = 'pre_save_campaigns';
export const PRE_SAVE_SUBSCRIBERS_TABLE = 'pre_save_subscribers';
export const PRE_SAVE_RATE_LIMIT_MAX_REQUESTS = 5;
export const PRE_SAVE_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export const PRE_SAVE_SQL = [
  'create extension if not exists pgcrypto;',
  '',
  'create table if not exists public.pre_save_campaigns (',
  '  id uuid primary key default gen_random_uuid(),',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  slug text not null unique,',
  '  artist_name text not null,',
  '  release_id uuid null references public.releases(id) on delete set null,',
  '  release_title text not null,',
  '  release_date date null,',
  '  cover_art_url text null,',
  "  streaming_links jsonb not null default '{}'::jsonb,",
  '  created_at timestamptz not null default now()',
  ');',
  '',
  'alter table public.pre_save_campaigns',
  '  add column if not exists release_id uuid null references public.releases(id) on delete set null;',
  '',
  'create index if not exists pre_save_campaigns_user_id_idx on public.pre_save_campaigns(user_id);',
  'create index if not exists pre_save_campaigns_release_id_idx on public.pre_save_campaigns(release_id);',
  'create index if not exists pre_save_campaigns_created_at_idx on public.pre_save_campaigns(created_at desc);',
  '',
  'create table if not exists public.pre_save_subscribers (',
  '  id uuid primary key default gen_random_uuid(),',
  '  campaign_id uuid not null references public.pre_save_campaigns(id) on delete cascade,',
  '  email text not null,',
  '  subscribed_at timestamptz not null default now()',
  ');',
  '',
  'create index if not exists pre_save_subscribers_campaign_id_idx on public.pre_save_subscribers(campaign_id);',
  'create index if not exists pre_save_subscribers_subscribed_at_idx on public.pre_save_subscribers(subscribed_at desc);',
  'create unique index if not exists pre_save_subscribers_campaign_email_unique_idx',
  '  on public.pre_save_subscribers(campaign_id, lower(email));',
  '',
  'alter table public.pre_save_campaigns enable row level security;',
  'alter table public.pre_save_subscribers enable row level security;',
].join('\n');

export type PreSaveCampaignRecord = {
  id: string;
  user_id: string;
  slug: string;
  artist_name: string;
  release_id: string | null;
  release_title: string;
  release_date: string | null;
  cover_art_url: string | null;
  streaming_links: unknown;
  created_at: string;
};

type ReleaseRecord = {
  id: string;
  user_id: string | null;
  owner_user_id: string | null;
  artist_name: string;
  title: string;
  release_date: string | null;
  created_at: string;
  updated_at: string;
};

type ReleaseMetadataRecord = {
  release_id: string;
  artwork_url: string | null;
};

export type PreSaveSubscriberRecord = {
  id: string;
  campaign_id: string;
  email: string;
  subscribed_at: string;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

declare global {
  var __urganizePreSaveRateLimitStore: Map<string, RateLimitEntry> | undefined;
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
    (message.includes('column') && message.includes('does not exist'))
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

export function createAdminClient(supabaseUrl: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export function buildMissingSchemaResponse(message = 'Pre-save tables are missing.') {
  return NextResponse.json({ error: message, sql: PRE_SAVE_SQL }, { status: 501 });
}

function toReleaseOption(
  release: ReleaseRecord,
  metadataByReleaseId: Map<string, ReleaseMetadataRecord>
): PreSaveReleaseOption {
  return {
    id: release.id,
    artistName: release.artist_name || '',
    title: release.title || '',
    releaseDate: release.release_date || null,
    coverArtUrl: metadataByReleaseId.get(release.id)?.artwork_url || null,
    createdAt: release.created_at || '',
    updatedAt: release.updated_at || '',
  };
}

function isReleaseOwnedByUser(release: ReleaseRecord, userId: string): boolean {
  return [release.owner_user_id, release.user_id].some((value) => value === userId);
}

async function loadReleaseMetadataMap(
  adminClient: ReturnType<typeof createAdminClient>,
  releaseIds: string[]
): Promise<{ metadataByReleaseId: Map<string, ReleaseMetadataRecord> } | { error: NextResponse }> {
  if (!adminClient || releaseIds.length === 0) {
    return { metadataByReleaseId: new Map<string, ReleaseMetadataRecord>() };
  }

  const { data, error } = await adminClient
    .from(RELEASE_METADATA_TABLE)
    .select('release_id,artwork_url')
    .in('release_id', releaseIds);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { metadataByReleaseId: new Map<string, ReleaseMetadataRecord>() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load linked release metadata.' },
        { status: 500 }
      ),
    };
  }

  const metadataByReleaseId = new Map<string, ReleaseMetadataRecord>();
  for (const row of data || []) {
    const metadata = row as Partial<ReleaseMetadataRecord>;
    const releaseId = String(metadata.release_id || '');
    if (!releaseId) {
      continue;
    }

    metadataByReleaseId.set(releaseId, {
      release_id: releaseId,
      artwork_url: typeof metadata.artwork_url === 'string' ? metadata.artwork_url : null,
    });
  }

  return { metadataByReleaseId };
}

export async function loadReleaseOptionsByIds(
  adminClient: ReturnType<typeof createAdminClient>,
  releaseIds: string[]
): Promise<{ optionsById: Map<string, PreSaveReleaseOption> } | { error: NextResponse }> {
  const normalizedReleaseIds = Array.from(new Set(releaseIds.filter(Boolean)));
  if (!adminClient || normalizedReleaseIds.length === 0) {
    return { optionsById: new Map<string, PreSaveReleaseOption>() };
  }

  const { data, error } = await adminClient
    .from('releases')
    .select('id,user_id,owner_user_id,artist_name,title,release_date,created_at,updated_at')
    .in('id', normalizedReleaseIds);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { optionsById: new Map<string, PreSaveReleaseOption>() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load linked releases.' },
        { status: 500 }
      ),
    };
  }

  const releaseRows = Array.isArray(data) ? (data as ReleaseRecord[]) : [];
  const metadataResult = await loadReleaseMetadataMap(
    adminClient,
    releaseRows.map((release) => release.id)
  );
  if ('error' in metadataResult) {
    return metadataResult;
  }

  const optionsById = new Map<string, PreSaveReleaseOption>();
  for (const release of releaseRows) {
    optionsById.set(release.id, toReleaseOption(release, metadataResult.metadataByReleaseId));
  }

  return { optionsById };
}

export async function loadUserReleaseOptions(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ releases: PreSaveReleaseOption[] } | { error: NextResponse }> {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const { data, error } = await adminClient
    .from('releases')
    .select('id,user_id,owner_user_id,artist_name,title,release_date,created_at,updated_at')
    .or(`owner_user_id.eq.${userId},user_id.eq.${userId}`)
    .order('release_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return {
        error: NextResponse.json({ error: 'Release operations tables are missing.' }, { status: 501 }),
      };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load your releases.' },
        { status: 500 }
      ),
    };
  }

  const releaseRows = Array.isArray(data) ? (data as ReleaseRecord[]) : [];
  const metadataResult = await loadReleaseMetadataMap(
    adminClient,
    releaseRows.map((release) => release.id)
  );
  if ('error' in metadataResult) {
    return metadataResult;
  }

  return {
    releases: releaseRows.map((release) => toReleaseOption(release, metadataResult.metadataByReleaseId)),
  };
}

export async function loadOwnedReleaseOption(
  adminClient: ReturnType<typeof createAdminClient>,
  releaseId: string,
  userId: string
): Promise<{ release: PreSaveReleaseOption | null } | { error: NextResponse }> {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const { data, error } = await adminClient
    .from('releases')
    .select('id,user_id,owner_user_id,artist_name,title,release_date,created_at,updated_at')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return {
        error: NextResponse.json({ error: 'Release operations tables are missing.' }, { status: 501 }),
      };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load the selected release.' },
        { status: 500 }
      ),
    };
  }

  const release = (data as ReleaseRecord | null) || null;
  if (!release || !isReleaseOwnedByUser(release, userId)) {
    return { release: null };
  }

  const metadataResult = await loadReleaseMetadataMap(adminClient, [release.id]);
  if ('error' in metadataResult) {
    return metadataResult;
  }

  return {
    release: toReleaseOption(release, metadataResult.metadataByReleaseId),
  };
}

export function toPreSaveCampaign(
  row: PreSaveCampaignRecord,
  subscriberCount = 0,
  linkedRelease?: PreSaveReleaseOption | null
): PreSaveCampaign {
  return {
    id: row.id,
    slug: row.slug,
    artistName: row.artist_name || linkedRelease?.artistName || '',
    releaseId: row.release_id || null,
    releaseTitle: linkedRelease?.title || row.release_title || '',
    releaseDate: linkedRelease?.releaseDate || row.release_date || null,
    coverArtUrl: linkedRelease?.coverArtUrl || row.cover_art_url || null,
    streamingLinks: normalizeStreamingLinks(row.streaming_links),
    createdAt: row.created_at,
    subscriberCount,
  };
}

export function toPublicPreSaveCampaign(
  row: PreSaveCampaignRecord,
  linkedRelease?: PreSaveReleaseOption | null
): PublicPreSaveCampaign {
  const campaign = toPreSaveCampaign(row, 0, linkedRelease);
  return {
    id: campaign.id,
    slug: campaign.slug,
    artistName: campaign.artistName,
    releaseId: campaign.releaseId,
    releaseTitle: campaign.releaseTitle,
    releaseDate: campaign.releaseDate,
    coverArtUrl: campaign.coverArtUrl,
    streamingLinks: campaign.streamingLinks,
    createdAt: campaign.createdAt,
  };
}

async function slugExists(
  adminClient: ReturnType<typeof createAdminClient>,
  slug: string
): Promise<boolean> {
  const result = await adminClient!
    .from(PRE_SAVE_CAMPAIGNS_TABLE)
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (result.error && !isOptionalTableMissingError(result.error)) {
    throw new Error(result.error.message || 'Could not validate slug uniqueness.');
  }

  return Boolean(result.data?.id);
}

export async function generateUniqueCampaignSlug(
  adminClient: ReturnType<typeof createAdminClient>,
  artistName: string,
  releaseTitle: string
): Promise<string> {
  const baseSlug = buildCampaignSlugBase(artistName, releaseTitle);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
    const candidate = `${baseSlug}-${suffix}`.slice(0, 64);
    const exists = await slugExists(adminClient, candidate);
    if (!exists) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now().toString(36).slice(-6)}`.slice(0, 64);
}

export async function ensureCampaignOwnership(
  adminClient: ReturnType<typeof createAdminClient>,
  campaignId: string,
  userId: string
): Promise<{ campaign: PreSaveCampaignRecord } | { error: NextResponse }> {
  const { data, error } = await adminClient!
    .from(PRE_SAVE_CAMPAIGNS_TABLE)
    .select('id,user_id,slug,artist_name,release_id,release_title,release_date,cover_art_url,streaming_links,created_at')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json({ error: error.message || 'Could not load campaign.' }, { status: 500 }),
    };
  }

  if (!data) {
    return { error: NextResponse.json({ error: 'Campaign not found.' }, { status: 404 }) };
  }

  return { campaign: data as PreSaveCampaignRecord };
}

export async function loadCampaignBySlug(
  adminClient: ReturnType<typeof createAdminClient>,
  slug: string
): Promise<{ campaign: PreSaveCampaignRecord | null } | { error: NextResponse }> {
  const { data, error } = await adminClient!
    .from(PRE_SAVE_CAMPAIGNS_TABLE)
    .select('id,user_id,slug,artist_name,release_id,release_title,release_date,cover_art_url,streaming_links,created_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json({ error: error.message || 'Could not load campaign.' }, { status: 500 }),
    };
  }

  return { campaign: (data as PreSaveCampaignRecord | null) || null };
}

function getRateLimitStore(): Map<string, RateLimitEntry> {
  if (!globalThis.__urganizePreSaveRateLimitStore) {
    globalThis.__urganizePreSaveRateLimitStore = new Map<string, RateLimitEntry>();
  }

  return globalThis.__urganizePreSaveRateLimitStore;
}

function cleanupRateLimitStore(store: Map<string, RateLimitEntry>) {
  if (store.size < 200) {
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

export function checkPreSaveSubscribeRateLimit(
  ipAddress: string
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const store = getRateLimitStore();
  cleanupRateLimitStore(store);

  const now = Date.now();
  const key = `pre-save:${ipAddress}`;
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + PRE_SAVE_RATE_LIMIT_WINDOW_MS,
    });
    return { ok: true };
  }

  if (current.count >= PRE_SAVE_RATE_LIMIT_MAX_REQUESTS) {
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

export function getCampaignStreamingLinks(
  campaign: PreSaveCampaignRecord
): PreSaveStreamingLinks {
  return normalizeStreamingLinks(campaign.streaming_links);
}
