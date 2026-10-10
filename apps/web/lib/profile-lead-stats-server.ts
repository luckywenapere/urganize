import type { SupabaseClient } from '@supabase/supabase-js';
import { readInChunks } from './paged-rows';
import { readTestRelease } from './test-release';
import {
  summarizeLeadStats,
  type LeadRecordRow,
  type LeadReleaseRow,
} from './directory-lead-stats';
import { EMPTY_LEAD_STATS, type LeadStats } from './directory-profile-type';

/**
 * Reads what a profile leads with, for many people at once.
 *
 * One query per kind of fact, not one per person: the directory paints up to
 * 200 cards and N+1 here would be N+1 on the first paint (the same reasoning
 * the list route gives for the delivery records).
 *
 * EVERY READ IS TOLERANT. A table that cannot be read leaves that part of the
 * numbers at zero, and a zero is never printed (lib/directory-profile-type.ts),
 * so a failure shortens a card's lead line rather than breaking the page or
 * inventing a number.
 */

type Row = Record<string, unknown>;

const asRow = (value: unknown): Row =>
  value && typeof value === 'object' ? (value as Row) : {};

async function readByUsers(
  admin: SupabaseClient,
  table: string,
  select: string,
  column: string,
  userIds: string[],
  orderBy: string
): Promise<Row[]> {
  try {
    const { rows } = await readInChunks<string, unknown>(userIds, (group, from, to) =>
      admin
        .from(table)
        .select(select)
        .in(column, group)
        .order(orderBy, { ascending: true })
        .range(from, to)
    );
    return rows.map(asRow);
  } catch {
    return [];
  }
}

export async function loadLeadStats(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, LeadStats>> {
  const stats = new Map<string, LeadStats>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return stats;

  const [releaseRows, artistRows, workspaceRows, recordRows] = await Promise.all([
    readByUsers(admin, 'releases', 'id, owner_user_id, status, metadata', 'owner_user_id', ids, 'id'),
    readByUsers(admin, 'artists', 'id, owner_user_id', 'owner_user_id', ids, 'id'),
    readByUsers(admin, 'workspaces', 'id, owner_id', 'owner_id', ids, 'id'),
    readByUsers(admin, 'delivery_records', 'id, user_id, release_id, show_id', 'user_id', ids, 'id'),
  ]);

  const workspaceOwner = new Map<string, string>();
  for (const row of workspaceRows) {
    workspaceOwner.set(String(row.id || ''), String(row.owner_id || ''));
  }

  // Active members of each owned team, counted in one read.
  const membersByOwner = new Map<string, number>();
  const workspaceIds = [...workspaceOwner.keys()].filter(Boolean);
  if (workspaceIds.length > 0) {
    try {
      const { rows } = await readInChunks<string, unknown>(workspaceIds, (group, from, to) =>
        admin
          .from('workspace_members')
          .select('id, workspace_id')
          .in('workspace_id', group)
          .eq('status', 'active')
          .order('id', { ascending: true })
          .range(from, to)
      );
      for (const raw of rows) {
        const owner = workspaceOwner.get(String(asRow(raw).workspace_id || ''));
        if (owner) membersByOwner.set(owner, (membersByOwner.get(owner) ?? 0) + 1);
      }
    } catch {
      // No team sizes this time; the line just omits them.
    }
  }

  const group = <T>(rows: Row[], key: string, map: (row: Row) => T): Map<string, T[]> => {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const userId = String(row[key] || '');
      if (!userId) continue;
      const list = grouped.get(userId) ?? [];
      list.push(map(row));
      grouped.set(userId, list);
    }
    return grouped;
  };

  const releasesByUser = group<LeadReleaseRow>(releaseRows, 'owner_user_id', (row) => ({
    status: row.status ? String(row.status) : null,
    isTest: readTestRelease((row.metadata ?? null) as Parameters<typeof readTestRelease>[0]),
  }));
  const artistsByUser = group(artistRows, 'owner_user_id', () => 1);
  const recordsByUser = group<LeadRecordRow>(recordRows, 'user_id', (row) => ({
    releaseId: row.release_id ? String(row.release_id) : null,
    showId: row.show_id ? String(row.show_id) : null,
  }));

  for (const userId of ids) {
    stats.set(
      userId,
      summarizeLeadStats({
        releases: releasesByUser.get(userId) ?? [],
        artistCount: artistsByUser.get(userId)?.length ?? 0,
        teamMembers: membersByOwner.get(userId) ?? 0,
        records: recordsByUser.get(userId) ?? [],
      })
    );
  }
  return stats;
}

export { EMPTY_LEAD_STATS };
