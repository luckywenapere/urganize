import type { SupabaseClient } from '@supabase/supabase-js';
import { parseOpportunityCreate, type OpportunityView } from '@/lib/opportunities';
import { createOpportunity } from '@/lib/opportunities-server';
import { programmeFromRow, lagosDay, type GrantProgrammeRow } from './weekly-run';
import {
  describeAward,
  isSuggestionLive,
  opportunityFromProgramme,
  type GrantSuggestionView,
  type SuggestionAction,
} from './suggestions';

// Reads and acts on a team's grant suggestions with the service role. The routes
// that call these have applied the team and guest rules already.

const PROGRAMME_COLUMNS =
  'id, slug, funder, programme, url, kind, countries, applicant_types, needs, genres, stages, amount_min, amount_max, currency, status, opens_on, deadline_on, last_closed_on, recurring, summary, eligibility, source_url, checked_on, active';

type Failure = { ok: false; error: string; status: number };
const fail = (error: string, status: number): Failure => ({ ok: false, error, status });

type SuggestionRow = {
  id: string;
  why: string;
  suggested_at: string;
  state: string;
  grant_programmes: GrantProgrammeRow | null;
};

export async function listGrantSuggestions(
  admin: SupabaseClient,
  workspaceId: string,
  now: Date = new Date()
): Promise<{ ok: true; suggestions: GrantSuggestionView[] } | Failure> {
  const { data, error } = await admin
    .from('grant_suggestions')
    .select(`id, why, suggested_at, state, grant_programmes(${PROGRAMME_COLUMNS})`)
    .eq('workspace_id', workspaceId)
    .eq('state', 'new')
    .order('suggested_at', { ascending: false })
    .limit(20);
  if (error) return fail('Could not load suggested grants.', 500);

  const { today } = lagosDay(now);
  const suggestions: GrantSuggestionView[] = [];
  for (const row of (data ?? []) as unknown as SuggestionRow[]) {
    if (!row.grant_programmes) continue;
    const p = programmeFromRow(row.grant_programmes);
    // A programme the curator switched off or closed, or whose round ended, is not shown.
    if (!p.active || p.status !== 'open' || !isSuggestionLive(p.deadlineOn, today)) continue;
    suggestions.push({
      id: row.id,
      why: row.why,
      funder: p.funder,
      programme: p.programme,
      kind: p.kind,
      summary: p.summary,
      award: describeAward(p),
      deadlineOn: p.deadlineOn,
      url: p.sourceUrl,
      suggestedAt: row.suggested_at,
    });
  }
  return { ok: true, suggestions };
}

export async function actOnGrantSuggestion(
  admin: SupabaseClient,
  input: { workspaceId: string; actorUserId: string; suggestionId: string; action: SuggestionAction; now?: Date }
): Promise<{ ok: true; opportunity: OpportunityView | null } | Failure> {
  const actedAt = (input.now ?? new Date()).toISOString();
  const nextState = input.action === 'add' ? 'added' : 'dismissed';

  // Claim the row first, only while it is still new and only on this team, so
  // two taps (or two teammates) cannot add the same grant twice.
  const { data: claimed, error: claimError } = await admin
    .from('grant_suggestions')
    .update({ state: nextState, acted_by: input.actorUserId, acted_at: actedAt })
    .eq('id', input.suggestionId)
    .eq('workspace_id', input.workspaceId)
    .eq('state', 'new')
    .select(`id, grant_programmes(${PROGRAMME_COLUMNS})`)
    .maybeSingle();
  if (claimError) return fail('Could not update that suggestion.', 500);
  if (!claimed) return fail('That suggestion is gone or was already handled.', 404);
  if (input.action === 'dismiss') return { ok: true, opportunity: null };

  const release = async () => {
    await admin
      .from('grant_suggestions')
      .update({ state: 'new', acted_by: null, acted_at: null })
      .eq('id', input.suggestionId)
      .eq('workspace_id', input.workspaceId);
  };

  const programmeRow = (claimed as unknown as { grant_programmes: GrantProgrammeRow | null }).grant_programmes;
  if (!programmeRow) {
    await release();
    return fail('That grant is no longer listed.', 410);
  }
  const programme = programmeFromRow(programmeRow);
  const parsed = parseOpportunityCreate(opportunityFromProgramme(programme));
  if ('error' in parsed) {
    await release();
    return fail(parsed.error, 400);
  }

  const created = await createOpportunity(admin, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    data: parsed.value,
  });
  if (!created.ok) {
    await release();
    return created;
  }

  // Best effort: the opportunity exists either way; these only record where it came from.
  await admin
    .from('opportunities')
    .update({ source_url: programme.sourceUrl, source_read_on: programme.checkedOn })
    .eq('id', created.opportunity.id)
    .eq('workspace_id', input.workspaceId);
  await admin
    .from('grant_suggestions')
    .update({ opportunity_id: created.opportunity.id })
    .eq('id', input.suggestionId)
    .eq('workspace_id', input.workspaceId);

  return { ok: true, opportunity: created.opportunity };
}
