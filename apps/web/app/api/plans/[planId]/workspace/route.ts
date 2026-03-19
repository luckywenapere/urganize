import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseReleasePlanResult, type ReleasePlanResult } from '@/lib/release-plan';

const WORKSPACE_TABLE = 'release_workspaces';

type MarketingCalendarItem = {
  id: string;
  platform: string;
  contentType: string;
  captionIdea: string;
  publishDate: string;
  owner: string;
};

type PlaylistTrackerItem = {
  id: string;
  curator: string;
  platform: string;
  submissionDate: string;
  status: 'Not Submitted' | 'Submitted' | 'Accepted' | 'Rejected';
  notes: string;
};

type DistributionChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

type WorkspacePlanSnapshot = ReleasePlanResult;

const isOptionalTableMissingError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
};

const WORKSPACE_SQL = [
  'create table if not exists public.release_workspaces (',
  '  release_id uuid primary key references public.releases(id) on delete cascade,',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  marketing_items jsonb not null default \'[]\'::jsonb,',
  '  playlist_items jsonb not null default \'[]\'::jsonb,',
  '  distribution_items jsonb not null default \'[]\'::jsonb,',
  '  plan_snapshot jsonb null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'alter table public.release_workspaces enable row level security;',
].join('\n');

const normalizeMarketingItems = (value: unknown): MarketingCalendarItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item as Partial<MarketingCalendarItem>;
      return {
        id: String(raw.id || '').trim(),
        platform: String(raw.platform || '').trim(),
        contentType: String(raw.contentType || '').trim(),
        captionIdea: String(raw.captionIdea || '').trim(),
        publishDate: String(raw.publishDate || '').trim(),
        owner: String(raw.owner || '').trim(),
      };
    })
    .filter((item) => item.id && item.platform && item.contentType);
};

const normalizePlaylistItems = (value: unknown): PlaylistTrackerItem[] => {
  if (!Array.isArray(value)) return [];
  const allowedStatus = new Set(['Not Submitted', 'Submitted', 'Accepted', 'Rejected']);
  return value
    .map((item) => {
      const raw = item as Partial<PlaylistTrackerItem>;
      const status = String(raw.status || 'Not Submitted');
      return {
        id: String(raw.id || '').trim(),
        curator: String(raw.curator || '').trim(),
        platform: String(raw.platform || '').trim(),
        submissionDate: String(raw.submissionDate || '').trim(),
        status: (allowedStatus.has(status) ? status : 'Not Submitted') as PlaylistTrackerItem['status'],
        notes: String(raw.notes || '').trim(),
      };
    })
    .filter((item) => item.id && item.curator && item.platform);
};

const normalizeDistributionItems = (value: unknown): DistributionChecklistItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item as Partial<DistributionChecklistItem>;
      return {
        id: String(raw.id || '').trim(),
        label: String(raw.label || '').trim(),
        done: Boolean(raw.done),
      };
    })
    .filter((item) => item.id && item.label);
};

const normalizePlanSnapshot = (value: unknown): WorkspacePlanSnapshot | null => {
  return parseReleasePlanResult(value);
};

const getAuthenticatedUser = async (request: NextRequest) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    error: userError,
  } = await authClient.auth.getUser(token);
  if (userError || !user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user, supabaseUrl };
};

const createAdminClient = (supabaseUrl: string) => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
};

async function ensureReleaseOwnership(adminClient: ReturnType<typeof createAdminClient>, planId: string, userId: string) {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }
  const { data: release, error } = await adminClient
    .from('releases')
    .select('id,user_id')
    .eq('id', planId)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message || 'Could not load plan' }, { status: 500 }) };
  if (!release || release.user_id !== userId) return { error: NextResponse.json({ error: 'Plan not found' }, { status: 404 }) };
  return { ok: true };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { planId } = await context.params;
  if (!planId) return NextResponse.json({ error: 'Plan id is required' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, planId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const { data, error } = await adminClient!
    .from(WORKSPACE_TABLE)
    .select('marketing_items,playlist_items,distribution_items,plan_snapshot')
    .eq('release_id', planId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json(
        { error: 'Workspace table is missing', sql: WORKSPACE_SQL },
        { status: 501 }
      );
    }
    return NextResponse.json({ error: error.message || 'Could not load workspace' }, { status: 500 });
  }

  return NextResponse.json({
    workspace: {
      marketingItems: normalizeMarketingItems(data?.marketing_items),
      playlistItems: normalizePlaylistItems(data?.playlist_items),
      distributionItems: normalizeDistributionItems(data?.distribution_items),
      planSnapshot: normalizePlanSnapshot(data?.plan_snapshot),
    },
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { planId } = await context.params;
  if (!planId) return NextResponse.json({ error: 'Plan id is required' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  const ownership = await ensureReleaseOwnership(adminClient, planId, auth.user.id);
  if ('error' in ownership) return ownership.error;

  const body = await request.json().catch(() => ({}));
  const marketingItems = normalizeMarketingItems(body?.marketingItems);
  const playlistItems = normalizePlaylistItems(body?.playlistItems);
  const distributionItems = normalizeDistributionItems(body?.distributionItems);
  const planSnapshot = normalizePlanSnapshot(body?.planSnapshot);

  const { error } = await adminClient!
    .from(WORKSPACE_TABLE)
    .upsert(
      {
        release_id: planId,
        user_id: auth.user.id,
        marketing_items: marketingItems,
        playlist_items: playlistItems,
        distribution_items: distributionItems,
        plan_snapshot: planSnapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'release_id' }
    );

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json(
        { error: 'Workspace table is missing', sql: WORKSPACE_SQL },
        { status: 501 }
      );
    }
    return NextResponse.json({ error: error.message || 'Could not save workspace' }, { status: 500 });
  }

  return NextResponse.json({ status: 'saved' });
}
