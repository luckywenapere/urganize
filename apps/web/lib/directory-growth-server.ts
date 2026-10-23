import type { SupabaseClient } from '@supabase/supabase-js';
import { readAll, str, type AdminReadSource, type Row } from './admin-read-server';
import { IN_LIST_CHUNK, inChunks } from './paged-rows';
import { readTestRelease } from './test-release';
import type { ScoreboardInput } from './scoreboard';
import {
  DIRECTORY_GROWTH_WEEKS,
  DIRECTORY_LIVE_MONTHS,
  buildDirectoryGrowth,
  buildLiveAtMap,
  type DirectoryGrowth,
  type GrowthInvite,
  type GrowthProfile,
  type GrowthRequest,
  type GrowthRollout,
  type GrowthSearch,
} from './directory-growth';

// The reads behind the directory's weekly numbers (2026-10-10), shared by
// GET /api/admin/directory and GET /api/admin/cockpit so the two cannot count
// differently. Every rule about what a number means lives in
// ./directory-growth.ts; this file only fetches rows, shapes them, and hands
// them over. Service-role only, read-only, and every read is paged (readAll).
//
// EVERY SOURCE IS OPTIONAL. Several of these tables and columns are built by
// other work in parallel (person_claim_invites, work_requests.accepted_release_id,
// and the profile columns that say who seeded a profile). A table or column that
// is not there yet comes back as null rows plus its source, and the page shows
// "Not tracked" for the numbers that depend on it. Nothing here ever turns a
// missing source into a zero.

const DAY_MS = 24 * 60 * 60 * 1000;
const TABLE_CAP = 20_000;

export type DirectoryGrowthExclusion = { workspaceIds: Set<string>; userIds: Set<string> };

export async function loadDirectoryGrowth(
  client: SupabaseClient,
  input: ScoreboardInput,
  exclusion?: DirectoryGrowthExclusion
): Promise<{ growth: DirectoryGrowth; sources: AdminReadSource[] }> {
  const nowMs = input.now.getTime();
  const weeksSince = new Date(nowMs - DIRECTORY_GROWTH_WEEKS * 7 * DAY_MS).toISOString();
  // Six calendar months back, for the rollouts-live table.
  const monthsSince = new Date(
    Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() - (DIRECTORY_LIVE_MONTHS - 1), 1)
  ).toISOString();

  const sources: AdminReadSource[] = [];

  const profilesRead = await readAll(
    'person_profiles (seeded and claimed)',
    (from, to) =>
      client
        .from('person_profiles')
        .select('user_id, created_at, claimed_at, created_by_workspace_id')
        .or(`created_at.gte.${weeksSince},claimed_at.gte.${weeksSince}`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    TABLE_CAP
  );
  sources.push(profilesRead.source);
  const profiles: GrowthProfile[] | null =
    profilesRead.source.status === 'ok' ? toProfiles(profilesRead.rows) : null;

  const [invitesRead, searchesRead, requestsRead] = await Promise.all([
    readAll(
      'person_claim_invites',
      (from, to) =>
        client
          .from('person_claim_invites')
          .select('created_at, workspace_id, created_by')
          .gte('created_at', weeksSince)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      TABLE_CAP
    ),
    readAll(
      'billing_events (directory searches by role)',
      (from, to) =>
        client
          .from('billing_events')
          .select('created_at, workspace_id, owner_user_id')
          .eq('type', 'directory_role_wanted')
          .gte('created_at', weeksSince)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      TABLE_CAP
    ),
    readRequests(client, monthsSince),
  ]);
  sources.push(invitesRead.source, searchesRead.source, requestsRead.source);

  // The rollouts the claimed people made. Chunked: one huge `.in(...)` is a URL
  // too long to send, and a refused request would read as "nobody started one".
  let rollouts: GrowthRollout[] | null = null;
  if (profiles) {
    const claimedUserIds = [
      ...new Set(profiles.filter((p) => p.claimedAt && p.userId).map((p) => p.userId as string)),
    ];
    if (claimedUserIds.length === 0) {
      rollouts = [];
    } else {
      const collected: GrowthRollout[] = [];
      let failed: AdminReadSource | null = null;
      let rows = 0;
      let truncated = false;
      for (const group of inChunks(claimedUserIds, IN_LIST_CHUNK)) {
        const read = await readAll(
          'releases (made by claimed people)',
          (from, to) =>
            client
              .from('releases')
              .select('owner_user_id, created_at, metadata')
              .in('owner_user_id', group)
              .is('deleted_at', null)
              .order('created_at', { ascending: true })
              .order('id', { ascending: true })
              .range(from, to),
          TABLE_CAP
        );
        rows += read.rows.length;
        truncated = truncated || read.source.truncated;
        if (read.source.status !== 'ok') {
          failed = read.source;
          break;
        }
        for (const row of read.rows) {
          const owner = str(row.owner_user_id);
          const createdAt = str(row.created_at);
          if (!owner || !createdAt) continue;
          if (readTestRelease((row.metadata ?? null) as Record<string, unknown> | null)) continue;
          collected.push({ ownerUserId: owner, createdAt });
        }
      }
      sources.push(
        failed ?? { table: 'releases (made by claimed people)', rows, status: 'ok', truncated }
      );
      rollouts = failed ? null : collected;
    }
  }

  const requests: GrowthRequest[] | null =
    requestsRead.source.status === 'ok' ? toRequests(requestsRead.rows) : null;
  const acceptedIds = requests
    ? requests.map((row) => row.acceptedReleaseId).filter((id): id is string => Boolean(id))
    : [];

  const growth = buildDirectoryGrowth({
    now: input.now,
    profiles,
    invites: invitesRead.source.status === 'ok' ? toInvites(invitesRead.rows) : null,
    rollouts,
    requests,
    acceptedTracked: requestsRead.acceptedTracked,
    liveAtByReleaseId: buildLiveAtMap(acceptedIds, input.releases, input.now),
    searches: searchesRead.source.status === 'ok' ? toSearches(searchesRead.rows) : null,
    exclusion,
  });

  return { growth, sources };
}

/**
 * work_requests, with accepted_release_id when that column exists. It is added
 * by other work in parallel, so a database without it is read again without it
 * and the live-from-the-directory numbers say "Not tracked" rather than zero.
 */
async function readRequests(
  client: SupabaseClient,
  since: string
): Promise<{ rows: Row[]; source: AdminReadSource; acceptedTracked: boolean }> {
  const query = (columns: string) => (from: number, to: number) =>
    client
      .from('work_requests')
      .select(columns)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

  const full = await readAll(
    'work_requests',
    query('created_at, status, workspace_id, sender_user_id, accepted_release_id'),
    TABLE_CAP
  );
  if (full.source.status === 'ok') return { ...full, acceptedTracked: true };
  if (full.source.status === 'missing') {
    const base = await readAll(
      'work_requests',
      query('created_at, status, workspace_id, sender_user_id'),
      TABLE_CAP
    );
    return { ...base, acceptedTracked: false };
  }
  return { ...full, acceptedTracked: false };
}

function toProfiles(rows: Row[]): GrowthProfile[] {
  const out: GrowthProfile[] = [];
  for (const row of rows) {
    const createdAt = str(row.created_at);
    if (!createdAt) continue;
    out.push({
      userId: str(row.user_id),
      workspaceId: str(row.created_by_workspace_id),
      createdAt,
      claimedAt: str(row.claimed_at),
      seeded: Boolean(str(row.created_by_workspace_id)),
    });
  }
  return out;
}

function toInvites(rows: Row[]): GrowthInvite[] {
  const out: GrowthInvite[] = [];
  for (const row of rows) {
    const createdAt = str(row.created_at);
    if (!createdAt) continue;
    out.push({ createdAt, workspaceId: str(row.workspace_id), ownerUserId: str(row.created_by) });
  }
  return out;
}

function toSearches(rows: Row[]): GrowthSearch[] {
  const out: GrowthSearch[] = [];
  for (const row of rows) {
    const createdAt = str(row.created_at);
    if (!createdAt) continue;
    out.push({ createdAt, workspaceId: str(row.workspace_id), ownerUserId: str(row.owner_user_id) });
  }
  return out;
}

function toRequests(rows: Row[]): GrowthRequest[] {
  const out: GrowthRequest[] = [];
  for (const row of rows) {
    const createdAt = str(row.created_at);
    const status = str(row.status);
    if (!createdAt || !status) continue;
    out.push({
      createdAt,
      status,
      acceptedReleaseId: str(row.accepted_release_id),
      workspaceId: str(row.workspace_id),
      ownerUserId: str(row.sender_user_id),
    });
  }
  return out;
}
