import { NextRequest, NextResponse } from 'next/server';
import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { RELEASE_METADATA_TABLE } from '@/lib/release-ops';
import {
  extractStoragePathFromPublicUrl,
  getFolderItemStoragePathFromUnknown,
  normalizeContactMetadata,
  normalizeContractMetadata,
  normalizeFileMetadata,
  normalizeReleaseMetadata,
  type ContactFolderItem,
  type ContractFolderItem,
  type FileFolderItem,
  type Folder,
  type FolderItem,
  type FolderItemType,
  type LinkFolderItem,
  type NoteFolderItem,
  type ReleaseFolderItem,
  FOLDER_STORAGE_BUCKET,
} from '@/lib/folders';
import type { PreSaveReleaseOption } from '@/lib/pre-save';

export const FOLDERS_TABLE = 'folders';
export const FOLDER_ITEMS_TABLE = 'folder_items';

export const FOLDERS_SQL = [
  'create extension if not exists pgcrypto;',
  '',
  "do $$ begin",
  "  create type public.folder_item_type as enum ('note', 'link', 'file', 'contact', 'release', 'contract');",
  'exception',
  '  when duplicate_object then null;',
  'end $$;',
  '',
  'create table if not exists public.folders (',
  '  id uuid primary key default gen_random_uuid(),',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  name text not null,',
  '  color text null,',
  '  icon text null,',
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'alter table public.folders',
  '  add column if not exists color text null;',
  'alter table public.folders',
  '  add column if not exists icon text null;',
  'alter table public.folders',
  '  add column if not exists updated_at timestamptz not null default now();',
  '',
  'create index if not exists folders_user_id_idx on public.folders(user_id);',
  'create index if not exists folders_updated_at_idx on public.folders(updated_at desc);',
  '',
  'create table if not exists public.folder_items (',
  '  id uuid primary key default gen_random_uuid(),',
  '  folder_id uuid not null references public.folders(id) on delete cascade,',
  '  user_id uuid not null references auth.users(id) on delete cascade,',
  '  type public.folder_item_type not null,',
  '  title text not null,',
  '  content text null,',
  '  url text null,',
  "  metadata jsonb not null default '{}'::jsonb,",
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'alter table public.folder_items',
  "  add column if not exists metadata jsonb not null default '{}'::jsonb;",
  'alter table public.folder_items',
  '  add column if not exists updated_at timestamptz not null default now();',
  '',
  'create index if not exists folder_items_folder_id_idx on public.folder_items(folder_id, updated_at desc);',
  'create index if not exists folder_items_user_id_idx on public.folder_items(user_id);',
  'create index if not exists folder_items_type_idx on public.folder_items(type);',
  '',
  'alter table public.folders enable row level security;',
  'alter table public.folder_items enable row level security;',
].join('\n');

export type FolderRecord = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
};

export type FolderItemRecord = {
  id: string;
  folder_id: string;
  user_id: string;
  type: FolderItemType;
  title: string;
  content: string | null;
  url: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
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
    message.includes('folder_item_type')
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

export function createAdminClient(supabaseUrl: string): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export function buildMissingSchemaResponse(message = 'Folders tables are missing.') {
  return NextResponse.json({ error: message, sql: FOLDERS_SQL }, { status: 501 });
}

export function toFolder(row: FolderRecord, itemCount = 0): Folder {
  return {
    id: row.id,
    name: row.name || '',
    color: row.color || null,
    icon: row.icon || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemCount,
    lastUpdatedAt: row.updated_at,
  };
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

async function loadReleaseMetadataMap(
  adminClient: SupabaseClient,
  releaseIds: string[]
): Promise<{ metadataByReleaseId: Map<string, ReleaseMetadataRecord> } | { error: NextResponse }> {
  if (releaseIds.length === 0) {
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
  adminClient: SupabaseClient,
  releaseIds: string[]
): Promise<{ optionsById: Map<string, PreSaveReleaseOption> } | { error: NextResponse }> {
  const normalizedIds = Array.from(new Set(releaseIds.filter(Boolean)));
  if (normalizedIds.length === 0) {
    return { optionsById: new Map<string, PreSaveReleaseOption>() };
  }

  const { data, error } = await adminClient
    .from('releases')
    .select('id,user_id,owner_user_id,artist_name,title,release_date,created_at,updated_at')
    .in('id', normalizedIds);

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

export async function loadOwnedReleaseOption(
  adminClient: SupabaseClient,
  releaseId: string,
  userId: string
): Promise<{ release: PreSaveReleaseOption | null } | { error: NextResponse }> {
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
  if (!release) {
    return { release: null };
  }

  if (![release.owner_user_id, release.user_id].includes(userId)) {
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

function getReleaseIdFromItem(row: FolderItemRecord): string {
  if (row.type !== 'release') {
    return '';
  }

  return normalizeReleaseMetadata(row.metadata).releaseId;
}

export function getFolderItemStoragePath(row: FolderItemRecord): string | null {
  const metadataStoragePath = getFolderItemStoragePathFromUnknown(row.metadata);
  if (metadataStoragePath) {
    return metadataStoragePath;
  }

  const publicUrl = String(row.url || '').trim();
  return publicUrl ? extractStoragePathFromPublicUrl(publicUrl) : null;
}

export function toFolderItem(
  row: FolderItemRecord,
  linkedRelease?: PreSaveReleaseOption | null
): FolderItem {
  const base = {
    id: row.id,
    folderId: row.folder_id,
    userId: row.user_id,
    type: row.type,
    title: row.type === 'release' ? linkedRelease?.title || row.title || '' : row.title || '',
    content: row.content || null,
    url: row.url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  switch (row.type) {
    case 'note':
      return {
        ...base,
        type: 'note',
        metadata: {},
      } satisfies NoteFolderItem;
    case 'link':
      return {
        ...base,
        type: 'link',
        metadata: {},
      } satisfies LinkFolderItem;
    case 'file': {
      const metadata = normalizeFileMetadata(row.metadata);
      return {
        ...base,
        type: 'file',
        metadata: {
          storagePath: metadata.storagePath,
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
          mimeType: metadata.mimeType,
        },
      } satisfies FileFolderItem;
    }
    case 'contact': {
      const metadata = normalizeContactMetadata(row.metadata);
      return {
        ...base,
        type: 'contact',
        metadata: {
          role: metadata.role,
          email: metadata.email,
          phone: metadata.phone,
        },
      } satisfies ContactFolderItem;
    }
    case 'release': {
      const metadata = normalizeReleaseMetadata(row.metadata);
      return {
        ...base,
        type: 'release',
        title: linkedRelease?.title || row.title || '',
        metadata: {
          releaseId: metadata.releaseId,
        },
        linkedRelease: linkedRelease || null,
      } satisfies ReleaseFolderItem;
    }
    case 'contract': {
      const metadata = normalizeContractMetadata(row.metadata);
      return {
        ...base,
        type: 'contract',
        metadata: {
          storagePath: metadata.storagePath,
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
          mimeType: metadata.mimeType,
          counterpartyName: metadata.counterpartyName,
          signedDate: metadata.signedDate,
          contractType: metadata.contractType,
        },
      } satisfies ContractFolderItem;
    }
    default:
      return {
        ...base,
        type: 'note',
        metadata: {},
      } satisfies NoteFolderItem;
  }
}

export async function ensureFolderOwnership(
  adminClient: SupabaseClient,
  folderId: string,
  userId: string
): Promise<{ folder: FolderRecord } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(FOLDERS_TABLE)
    .select('id,user_id,name,color,icon,created_at,updated_at')
    .eq('id', folderId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json({ error: error.message || 'Could not load folder.' }, { status: 500 }),
    };
  }

  if (!data) {
    return { error: NextResponse.json({ error: 'Folder not found.' }, { status: 404 }) };
  }

  return { folder: data as FolderRecord };
}

export async function ensureFolderItemOwnership(
  adminClient: SupabaseClient,
  folderId: string,
  itemId: string,
  userId: string
): Promise<{ item: FolderItemRecord } | { error: NextResponse }> {
  const { data, error } = await adminClient
    .from(FOLDER_ITEMS_TABLE)
    .select('id,folder_id,user_id,type,title,content,url,metadata,created_at,updated_at')
    .eq('id', itemId)
    .eq('folder_id', folderId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json({ error: error.message || 'Could not load folder item.' }, { status: 500 }),
    };
  }

  if (!data) {
    return { error: NextResponse.json({ error: 'Folder item not found.' }, { status: 404 }) };
  }

  return { item: data as FolderItemRecord };
}

export async function loadFolderItemCounts(
  adminClient: SupabaseClient,
  folderIds: string[]
): Promise<{ counts: Map<string, number> } | { error: NextResponse }> {
  if (folderIds.length === 0) {
    return { counts: new Map<string, number>() };
  }

  const { data, error } = await adminClient
    .from(FOLDER_ITEMS_TABLE)
    .select('folder_id')
    .in('folder_id', folderIds);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load folder item counts.' },
        { status: 500 }
      ),
    };
  }

  const counts = new Map<string, number>();
  for (const row of data || []) {
    const folderId = String((row as { folder_id?: string }).folder_id || '');
    if (!folderId) {
      continue;
    }

    counts.set(folderId, (counts.get(folderId) || 0) + 1);
  }

  return { counts };
}

export async function touchFolder(adminClient: SupabaseClient, folderId: string) {
  const { error } = await adminClient
    .from(FOLDERS_TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq('id', folderId);

  if (error && !isOptionalTableMissingError(error)) {
    throw new Error(error.message || 'Could not update folder timestamp.');
  }
}

export async function removeFolderStoragePaths(
  adminClient: SupabaseClient,
  paths: string[]
): Promise<{ ok: true } | { error: NextResponse }> {
  const normalizedPaths = Array.from(new Set(paths.filter(Boolean)));
  if (normalizedPaths.length === 0) {
    return { ok: true };
  }

  const { error } = await adminClient.storage
    .from(FOLDER_STORAGE_BUCKET)
    .remove(normalizedPaths);

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not remove stored files.' },
        { status: 500 }
      ),
    };
  }

  return { ok: true };
}

export async function loadFolderItems(
  adminClient: SupabaseClient,
  folderId: string,
  typeFilter: FolderItemType | null = null
): Promise<{ items: FolderItem[] } | { error: NextResponse }> {
  let query = adminClient
    .from(FOLDER_ITEMS_TABLE)
    .select('id,folder_id,user_id,type,title,content,url,metadata,created_at,updated_at')
    .eq('folder_id', folderId)
    .order('updated_at', { ascending: false });

  if (typeFilter) {
    query = query.eq('type', typeFilter);
  }

  const { data, error } = await query;
  if (error) {
    if (isOptionalTableMissingError(error)) {
      return { error: buildMissingSchemaResponse() };
    }

    return {
      error: NextResponse.json({ error: error.message || 'Could not load folder items.' }, { status: 500 }),
    };
  }

  const itemRows = Array.isArray(data) ? (data as FolderItemRecord[]) : [];
  const releaseIds = itemRows
    .map((row) => getReleaseIdFromItem(row))
    .filter(Boolean);

  const linkedReleaseResult = await loadReleaseOptionsByIds(adminClient, releaseIds);
  if ('error' in linkedReleaseResult) {
    return linkedReleaseResult;
  }

  return {
    items: itemRows.map((row) =>
      toFolderItem(row, linkedReleaseResult.optionsById.get(getReleaseIdFromItem(row)) || null)
    ),
  };
}
