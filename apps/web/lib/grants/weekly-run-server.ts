import type { SupabaseClient } from '@supabase/supabase-js';
import { getWorkspaceAccess } from '@/lib/team-billing-server';
import type { GrantProfileRow } from './grant-profile';
import { grantSuggestionsEnabled } from './grant-suggestions-flag';
import { programmeFromRow, type GrantProgrammeRow } from './weekly-run';
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
  };
}

export async function runWeeklyGrantSuggestions(
  admin: SupabaseClient,
  options: { now?: Date; timeBudgetMs: number }
): Promise<GrantRunResult | { skipped: 'flag_off' } | { error: string }> {
  if (!grantSuggestionsEnabled()) return { skipped: 'flag_off' };
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
