import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OpportunityCreate,
  OpportunityCurrency,
  OpportunityKind,
  OpportunityPatch,
  OpportunityStatus,
  OpportunityView,
} from './opportunities';

// Reading and writing a team's opportunities. Every function takes the team's
// workspace id from the caller and scopes every query to it; nothing here trusts
// an id from a request body. The artist and the rollout a row is filed under are
// checked against the team before they are written.

const TABLE = 'opportunities';
const LIST_LIMIT = 1000;

const COLUMNS =
  'id, workspace_id, artist_id, release_id, title, kind, status, counterparty, amount, currency, next_step, next_step_on, deadline_on, notes, created_at, updated_at';

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const orNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export function toOpportunityView(raw: unknown): OpportunityView {
  const row = asRow(raw);
  const amount = row.amount === null || row.amount === undefined ? null : Number(row.amount);
  return {
    id: text(row.id),
    title: text(row.title),
    kind: text(row.kind) as OpportunityKind,
    status: text(row.status) as OpportunityStatus,
    counterparty: text(row.counterparty),
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    currency: (text(row.currency) || 'NGN') as OpportunityCurrency,
    nextStep: text(row.next_step),
    nextStepOn: orNull(row.next_step_on),
    deadlineOn: orNull(row.deadline_on),
    notes: text(row.notes),
    artistId: orNull(row.artist_id),
    releaseId: orNull(row.release_id),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

type Failure = { ok: false; error: string; status: number };

const fail = (error: string, status: number): Failure => ({ ok: false, error, status });

/**
 * The artist and rollout must belong to this team. A rollout belongs to the
 * team through its artist, so it is checked that way; an id from another team
 * and one that does not exist answer the same.
 */
async function checkLinks(
  admin: SupabaseClient,
  workspaceId: string,
  links: { artistId?: string | null; releaseId?: string | null }
): Promise<Failure | null> {
  if (links.artistId) {
    const { data, error } = await admin
      .from('artists')
      .select('id')
      .eq('id', links.artistId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) return fail('Could not check that artist.', 500);
    if (!data) return fail('That artist is not on your team.', 400);
  }
  if (links.releaseId) {
    const { data, error } = await admin
      .from('releases')
      .select('id, artist_id')
      .eq('id', links.releaseId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return fail('Could not check that rollout.', 500);
    const artistId = data ? text(asRow(data).artist_id) : '';
    if (!artistId) return fail('That rollout is not on your team.', 400);
    const { data: artist, error: artistError } = await admin
      .from('artists')
      .select('id')
      .eq('id', artistId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (artistError) return fail('Could not check that rollout.', 500);
    if (!artist) return fail('That rollout is not on your team.', 400);
  }
  return null;
}

export async function listOpportunities(
  admin: SupabaseClient,
  workspaceId: string
): Promise<{ ok: true; opportunities: OpportunityView[] } | Failure> {
  const { data, error } = await admin
    .from(TABLE)
    .select(COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) return fail('Could not load your opportunities.', 500);
  return { ok: true, opportunities: (data || []).map(toOpportunityView) };
}

export async function createOpportunity(
  admin: SupabaseClient,
  input: { workspaceId: string; actorUserId: string; data: OpportunityCreate }
): Promise<{ ok: true; opportunity: OpportunityView } | Failure> {
  const d = input.data;
  const bad = await checkLinks(admin, input.workspaceId, { artistId: d.artistId, releaseId: d.releaseId });
  if (bad) return bad;
  const { data, error } = await admin
    .from(TABLE)
    .insert({
      workspace_id: input.workspaceId,
      created_by: input.actorUserId,
      artist_id: d.artistId,
      release_id: d.releaseId,
      title: d.title,
      kind: d.kind,
      status: d.status,
      counterparty: d.counterparty,
      amount: d.amount,
      currency: d.currency,
      next_step: d.nextStep,
      next_step_on: d.nextStepOn,
      deadline_on: d.deadlineOn,
      notes: d.notes,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) return fail('Could not add that opportunity.', 500);
  return { ok: true, opportunity: toOpportunityView(data) };
}

function patchToColumns(patch: OpportunityPatch): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  if (patch.title !== undefined) columns.title = patch.title;
  if (patch.kind !== undefined) columns.kind = patch.kind;
  if (patch.status !== undefined) columns.status = patch.status;
  if (patch.counterparty !== undefined) columns.counterparty = patch.counterparty;
  if (patch.amount !== undefined) columns.amount = patch.amount;
  if (patch.currency !== undefined) columns.currency = patch.currency;
  if (patch.nextStep !== undefined) columns.next_step = patch.nextStep;
  if (patch.nextStepOn !== undefined) columns.next_step_on = patch.nextStepOn;
  if (patch.deadlineOn !== undefined) columns.deadline_on = patch.deadlineOn;
  if (patch.notes !== undefined) columns.notes = patch.notes;
  if (patch.artistId !== undefined) columns.artist_id = patch.artistId;
  if (patch.releaseId !== undefined) columns.release_id = patch.releaseId;
  return columns;
}

export async function updateOpportunity(
  admin: SupabaseClient,
  workspaceId: string,
  opportunityId: string,
  patch: OpportunityPatch
): Promise<{ ok: true; opportunity: OpportunityView } | Failure> {
  const bad = await checkLinks(admin, workspaceId, { artistId: patch.artistId, releaseId: patch.releaseId });
  if (bad) return bad;
  const { data, error } = await admin
    .from(TABLE)
    .update(patchToColumns(patch))
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return fail('Could not save that.', 500);
  if (!data) return fail('Opportunity not found.', 404);
  return { ok: true, opportunity: toOpportunityView(data) };
}

export async function removeOpportunity(
  admin: SupabaseClient,
  workspaceId: string,
  opportunityId: string
): Promise<{ ok: true } | Failure> {
  const { data, error } = await admin
    .from(TABLE)
    .delete()
    .eq('id', opportunityId)
    .eq('workspace_id', workspaceId)
    .select('id')
    .maybeSingle();
  if (error) return fail('Could not remove that opportunity.', 500);
  if (!data) return fail('Opportunity not found.', 404);
  return { ok: true };
}
