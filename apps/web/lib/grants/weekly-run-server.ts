import type { SupabaseClient } from '@supabase/supabase-js';
import { getWorkspaceAccess } from '@/lib/team-billing-server';
import type { GrantProfileRow } from './grant-profile';
import { grantSuggestionsEnabled } from './grant-suggestions-flag';
import { isOpportunitiesEnabled } from '@/lib/paused-features';
import { GRANT_PUSH_KIND, GRANT_PUSH_URL, grantPushCopy, programmeFromRow, type GrantProgrammeRow } from './weekly-run';
import { runGrantSuggestionsWith, type GrantRunResult, type GrantRunStore } from './weekly-run-core';

// The weekly Suggested grants run, against the real database. Called from the
// daily notifications cron. Never throws: the cron also sends pushes and emails.

const PROGRAMME_COLUMNS =
  'id, slug, funder, programme, url, kind, countries, applicant_types, needs, genres, stages, amount_min, amount_max, currency, status, opens_on, deadline_on, last_closed_on, recurring, summary, eligibility, source_url, checked_on, active';

function storeFor(admin: SupabaseClient): GrantRunStore {
  return {
    async loadProgrammes() {
      const { data, error } = await admin
        .from('grant_programmes')
        .select(PROGRAMME_COLUMNS)
        .eq('active', true)
        .eq('status', 'open');
      if (error) throw new Error('grant_programmes read failed');
      return ((data ?? []) as GrantProgrammeRow[]).map((row) => ({ id: row.id, programme: programmeFromRow(row) }));
    },
    async loadProfiles() {
      const { data, error } = await admin
        .from('grant_profiles')
        .select('workspace_id, country, stage, applicant_types, genres, needs')
        .not('country', 'is', null);
      if (error) throw new Error('grant_profiles read failed');
      return ((data ?? []) as Array<GrantProfileRow & { workspace_id: string }>).map(({ workspace_id, ...row }) => ({
        workspaceId: workspace_id,
        row,
      }));
    },
    async loadHistory(workspaceId) {
      const { data, error } = await admin
        .from('grant_suggestions')
        .select('programme_id, suggested_at')
        .eq('workspace_id', workspaceId);
      if (error) throw new Error('grant_suggestions read failed');
      const rows = (data ?? []) as Array<{ programme_id: string; suggested_at: string }>;
      let last: string | null = null;
      for (const row of rows) if (!last || row.suggested_at > last) last = row.suggested_at;
      return { programmeIds: new Set(rows.map((row) => row.programme_id)), lastSuggestedAt: last };
    },
    async resolveAccessState(workspaceId) {
      return (await getWorkspaceAccess(workspaceId))?.state ?? null;
    },
    async insertSuggestions(rows) {
      // The unique (workspace_id, programme_id) is the last word: a row that is
      // already there is left alone, tombstones included.
      const { data, error } = await admin
        .from('grant_suggestions')
        .upsert(
          rows.map((row) => ({ workspace_id: row.workspaceId, programme_id: row.programmeId, why: row.why })),
          { onConflict: 'workspace_id,programme_id', ignoreDuplicates: true }
        )
        .select('id');
      if (error) throw new Error('grant_suggestions insert failed');
      return (data ?? []).length;
    },
    async queueTeamPush(workspaceId, count) {
      const recipients = await teamPushRecipients(admin, workspaceId);
      if (recipients.length === 0) return 0;
      const { title, body } = grantPushCopy(count);
      const nowIso = new Date().toISOString();
      const { error } = await admin.from('scheduled_notifications').insert(
        recipients.map((userId) => ({
          user_id: userId,
          kind: GRANT_PUSH_KIND,
          title,
          body,
          url: GRANT_PUSH_URL,
          send_at: nowIso,
        }))
      );
      if (error) throw new Error('scheduled_notifications insert failed');
      await admin
        .from('grant_suggestions')
        .update({ notified_at: nowIso })
        .eq('workspace_id', workspaceId)
        .eq('state', 'new')
        .is('notified_at', null);
      return recipients.length;
    },
  };
}

/**
 * Who gets the push: the owner and every active member, except a member limited
 * to one artist, who cannot open the team's Opportunities. If the scope column
 * cannot be read, only the owner is told rather than guessing.
 */
async function teamPushRecipients(admin: SupabaseClient, workspaceId: string): Promise<string[]> {
  const ids = new Set<string>();
  const { data: workspace } = await admin.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
  const ownerId = (workspace as { owner_id: string | null } | null)?.owner_id;
  if (ownerId) ids.add(ownerId);
  const { data: members, error } = await admin
    .from('workspace_members')
    .select('user_id, artist_scope_id, release_scope_ids')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active');
  if (!error) {
    for (const member of (members ?? []) as Array<{
      user_id: string | null;
      artist_scope_id: string | null;
      release_scope_ids: string[] | null;
    }>) {
      // Only unlimited members: a limited one (one artist, or chosen rollouts) is not told about team grants.
      if (member.user_id && !member.artist_scope_id && !Array.isArray(member.release_scope_ids)) ids.add(member.user_id);
    }
  }
  return [...ids];
}

export async function runWeeklyGrantSuggestions(
  admin: SupabaseClient,
  options: { now?: Date; timeBudgetMs: number }
): Promise<GrantRunResult | { skipped: 'flag_off' } | { error: string }> {
  // Opportunities is paused (Oct 27, 2026): no matching, no push into it.
  if (!grantSuggestionsEnabled() || !isOpportunitiesEnabled()) return { skipped: 'flag_off' };
  try {
    return await runGrantSuggestionsWith(storeFor(admin), {
      now: options.now ?? new Date(),
      timeBudgetMs: options.timeBudgetMs,
    });
  } catch (error) {
    console.error('[grants] weekly run failed:', error instanceof Error ? error.message : 'unknown');
    return { error: 'weekly grant run failed' };
  }
}
