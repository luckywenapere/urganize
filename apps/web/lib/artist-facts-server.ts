// Artist facts, the database side (SERVER-ONLY). Rules and copy live in
// ./artist-facts.ts; this module only reads and writes rows.
//
// WHO CAN SEE AN ARTIST'S FACTS: anyone on the team that holds the artist,
// except an artist-scoped member, who sees only their own artist. Both callers
// (the routes and the UrgAns tools) pass the same FactScope, built from
// loadWorkspaceAccessContext or the Chappi context, so the rule lives here once.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ARTISTS_TABLE } from './artists-server';
import {
  isArtistFactTopic,
  planFactSave,
  type ArtistFact,
  type ArtistFactSource,
  type ArtistFactTopic,
  type FactSavePlan,
} from './artist-facts';

export const ARTIST_FACTS_TABLE = 'artist_facts';

const FACT_COLUMNS = 'id, workspace_id, artist_id, topic, value, source, said_by, created_at, updated_at';

export type FactScope = {
  workspaceIds: string[];
  artistScopeByWorkspaceId: Record<string, string>;
};

export type FactArtist = { id: string; name: string; workspaceId: string };

function toFact(row: Record<string, unknown>): ArtistFact | null {
  if (!isArtistFactTopic(row.topic)) return null;
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    artistId: String(row.artist_id),
    topic: row.topic,
    value: String(row.value ?? ''),
    source: row.source === 'chat' ? 'chat' : 'manual',
    saidBy: typeof row.said_by === 'string' ? row.said_by : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? row.created_at ?? ''),
  };
}

const inScope = (scope: FactScope, workspaceId: string, artistId: string) => {
  if (!scope.workspaceIds.includes(workspaceId)) return false;
  const only = scope.artistScopeByWorkspaceId[workspaceId];
  return !only || only === artistId;
};

/** The artist, if the caller may see it. Anything else reads as not found. */
export async function resolveFactArtist(
  admin: SupabaseClient,
  scope: FactScope,
  artistId: string
): Promise<FactArtist | null> {
  const id = String(artistId || '').trim();
  if (!id || !scope.workspaceIds.length) return null;
  const { data } = await admin
    .from(ARTISTS_TABLE)
    .select('id, name, workspace_id')
    .eq('id', id)
    .in('workspace_id', scope.workspaceIds)
    .maybeSingle();
  const row = data as { id: string; name: string; workspace_id: string } | null;
  if (!row || !inScope(scope, row.workspace_id, row.id)) return null;
  return { id: row.id, name: row.name, workspaceId: row.workspace_id };
}

export async function listArtistFacts(admin: SupabaseClient, artistId: string): Promise<ArtistFact[]> {
  const { data, error } = await admin
    .from(ARTIST_FACTS_TABLE)
    .select(FACT_COLUMNS)
    .eq('artist_id', artistId)
    .order('created_at', { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => toFact(row as Record<string, unknown>)).filter((f): f is ArtistFact => Boolean(f));
}

/** Every fact the caller may see, grouped by artist, for UrgAns's context. */
export async function listFactsInScope(
  admin: SupabaseClient,
  scope: FactScope
): Promise<{ artistId: string; artistName: string; facts: ArtistFact[] }[]> {
  if (!scope.workspaceIds.length) return [];
  const [factsRes, artistsRes] = await Promise.all([
    admin
      .from(ARTIST_FACTS_TABLE)
      .select(FACT_COLUMNS)
      .in('workspace_id', scope.workspaceIds)
      .order('created_at', { ascending: true })
      .limit(500),
    admin.from(ARTISTS_TABLE).select('id, name, workspace_id').in('workspace_id', scope.workspaceIds),
  ]);
  if (factsRes.error || artistsRes.error) return [];

  const names = new Map(
    ((artistsRes.data ?? []) as { id: string; name: string }[]).map((artist) => [artist.id, artist.name])
  );
  const groups = new Map<string, { artistId: string; artistName: string; facts: ArtistFact[] }>();
  for (const row of (factsRes.data ?? []) as Record<string, unknown>[]) {
    const fact = toFact(row);
    if (!fact || !inScope(scope, fact.workspaceId, fact.artistId)) continue;
    const name = names.get(fact.artistId);
    if (!name) continue;
    const group = groups.get(fact.artistId) ?? { artistId: fact.artistId, artistName: name, facts: [] };
    group.facts.push(fact);
    groups.set(fact.artistId, group);
  }
  return [...groups.values()];
}

/** Display names for the people who said each fact, keyed by user id. */
export async function loadFactAuthors(admin: SupabaseClient, facts: ArtistFact[]): Promise<Record<string, string>> {
  const ids = [...new Set(facts.map((f) => f.saidBy).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return {};
  const { data } = await admin.from('profiles').select('id, name').in('id', ids);
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; name: string | null }[]) {
    const first = String(row.name ?? '').trim().split(/\s+/)[0];
    if (first) out[row.id] = first;
  }
  return out;
}

export type SaveFactResult =
  | { ok: true; fact: ArtistFact; plan: FactSavePlan }
  | { ok: false; status: number; error: string };

/**
 * Save a fact on an artist the caller has already resolved. The plan is worked
 * out again here, against the rows as they are now, so a card approved after
 * someone else changed the page cannot save a duplicate.
 */
export async function saveArtistFact(
  admin: SupabaseClient,
  params: {
    artist: FactArtist;
    topic: ArtistFactTopic;
    value: string;
    source: ArtistFactSource;
    userId: string;
    factId?: string | null;
  }
): Promise<SaveFactResult> {
  const { artist, topic, value, source, userId } = params;
  const existing = await listArtistFacts(admin, artist.id);
  const plan = planFactSave(existing, { topic, value, factId: params.factId });

  if (plan.kind === 'missing') return { ok: false, status: 404, error: 'That fact is gone. It may have been removed.' };
  if (plan.kind === 'full') {
    return { ok: false, status: 409, error: `${artist.name} already has 10 other facts. Remove one first.` };
  }
  if (plan.kind === 'taken') {
    return { ok: false, status: 409, error: `${artist.name} already has a fact on this topic. Change that one instead.` };
  }
  if (plan.kind === 'unchanged') return { ok: true, fact: plan.previous, plan };

  const fields = { topic, value, source, said_by: userId };
  const query =
    plan.kind === 'replace'
      ? admin.from(ARTIST_FACTS_TABLE).update(fields).eq('id', plan.previous.id)
      : admin.from(ARTIST_FACTS_TABLE).insert({ ...fields, workspace_id: artist.workspaceId, artist_id: artist.id });
  const { data, error } = await query.select(FACT_COLUMNS).single();
  const fact = data ? toFact(data as Record<string, unknown>) : null;
  if (error || !fact) return { ok: false, status: 500, error: 'Could not save that. Try again.' };
  return { ok: true, fact, plan };
}

export async function deleteArtistFact(
  admin: SupabaseClient,
  artist: FactArtist,
  factId: string
): Promise<{ ok: true; fact: ArtistFact } | { ok: false; status: number; error: string }> {
  const fact = (await listArtistFacts(admin, artist.id)).find((f) => f.id === factId);
  if (!fact) return { ok: false, status: 404, error: 'That fact is gone. It may have been removed.' };
  const { error } = await admin.from(ARTIST_FACTS_TABLE).delete().eq('id', fact.id);
  if (error) return { ok: false, status: 500, error: 'Could not remove that. Try again.' };
  return { ok: true, fact };
}

/** Find which visible artist holds a fact, for tools that only get a factId. */
export async function resolveFactById(
  admin: SupabaseClient,
  scope: FactScope,
  factId: string
): Promise<{ artist: FactArtist; fact: ArtistFact } | null> {
  const id = String(factId || '').trim();
  if (!id || !scope.workspaceIds.length) return null;
  const { data } = await admin
    .from(ARTIST_FACTS_TABLE)
    .select(FACT_COLUMNS)
    .eq('id', id)
    .in('workspace_id', scope.workspaceIds)
    .maybeSingle();
  const fact = data ? toFact(data as Record<string, unknown>) : null;
  if (!fact) return null;
  const artist = await resolveFactArtist(admin, scope, fact.artistId);
  return artist ? { artist, fact } : null;
}
