// Team brief reads and writes (SERVER-ONLY).
//
// Everything here uses the service-role client, so the RLS on
// team_brief_sections is defense in depth and THIS is the access control — the
// same division the rest of the product uses (see the migration header).
//
// Deliberately leaf: it imports the pure module and the workspace resolver and
// nothing paywall-adjacent, so the prompt builder can call it on every request
// without dragging the billing chain in behind it.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TEAM_BRIEF_SECTIONS,
  briefCompletion,
  canEditTeamBrief,
  isTeamBriefSection,
  normalizeBriefContent,
  type TeamBrief,
  type TeamBriefCompletion,
  type TeamBriefEntry,
  type TeamBriefSection,
} from './team-brief';

const TABLE = 'team_brief_sections';

type Row = {
  section: string;
  content: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

/**
 * Every written section for a team, newest content wins.
 *
 * NEVER THROWS. This is called from the system-prompt builder on every UrgAns
 * request, and a brief that cannot be read is worth strictly less than an
 * assistant that still answers — an unapplied migration must degrade to "no
 * brief", not to a broken assistant.
 */
export async function loadTeamBriefEntries(
  adminClient: SupabaseClient,
  workspaceId: string
): Promise<TeamBriefEntry[]> {
  if (!workspaceId) return [];
  try {
    const { data, error } = await adminClient
      .from(TABLE)
      .select('section,content,updated_at,updated_by')
      .eq('workspace_id', workspaceId);
    if (error) throw error;

    const rows = (Array.isArray(data) ? data : []) as Row[];
    const byUser = await loadNames(
      adminClient,
      rows.map((r) => r.updated_by).filter(Boolean) as string[]
    );

    const bySection = new Map<TeamBriefSection, TeamBriefEntry>();
    for (const row of rows) {
      if (!isTeamBriefSection(row.section)) continue;
      bySection.set(row.section, {
        section: row.section,
        content: normalizeBriefContent(row.content),
        updatedAt: row.updated_at,
        updatedByName: row.updated_by ? byUser.get(row.updated_by) || null : null,
      });
    }

    // Returned in the canonical section order rather than the query's, so the
    // editor and the prompt agree on sequence without either sorting.
    return TEAM_BRIEF_SECTIONS.map(
      (section) =>
        bySection.get(section) || {
          section,
          content: '',
          updatedAt: null,
          updatedByName: null,
        }
    );
  } catch (error) {
    console.error('[team-brief] could not load sections:', error);
    return [];
  }
}

async function loadNames(
  adminClient: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds));
  if (!ids.length) return new Map();
  const { data, error } = await adminClient
    .from('profiles')
    .select('id,name,email')
    .in('id', ids);
  if (error || !Array.isArray(data)) return new Map();
  return new Map(
    (data as Array<{ id: string; name: string | null; email: string | null }>).map((p) => [
      p.id,
      p.name?.trim() || p.email?.trim() || 'A teammate',
    ])
  );
}

/** Whether this team has narrowed editing to owners and admins. Absent column
 *  (migration not applied) reads as false, which is the permissive default the
 *  spec asks for. */
export async function loadBriefEditRestricted(
  adminClient: SupabaseClient,
  workspaceId: string
): Promise<boolean> {
  if (!workspaceId) return false;
  try {
    const { data, error } = await adminClient
      .from('workspaces')
      .select('brief_edit_restricted')
      .eq('id', workspaceId)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean((data as { brief_edit_restricted?: boolean }).brief_edit_restricted);
  } catch {
    return false;
  }
}

/** The whole brief plus whether this caller may edit it. */
export async function loadTeamBrief(
  adminClient: SupabaseClient,
  workspaceId: string,
  workspaceRole: string | null
): Promise<TeamBrief> {
  const [entries, editRestricted] = await Promise.all([
    loadTeamBriefEntries(adminClient, workspaceId),
    loadBriefEditRestricted(adminClient, workspaceId),
  ]);
  return {
    entries,
    editRestricted,
    canEdit: canEditTeamBrief({ editRestricted, workspaceRole }),
  };
}

/**
 * Write one section.
 *
 * An upsert on (workspace_id, section) — the unique index is the target — so
 * the editor never has to know whether a section has been written before, and
 * two people saving the same section cannot create two rows.
 *
 * `updated_at` is set explicitly rather than left to the trigger: the trigger
 * fires BEFORE UPDATE only, so a first-ever INSERT would otherwise carry the
 * default and an edit made seconds later would look older than it is.
 */
export async function saveTeamBriefSection(
  adminClient: SupabaseClient,
  input: {
    workspaceId: string;
    section: TeamBriefSection;
    content: string;
    userId: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient.from(TABLE).upsert(
    {
      workspace_id: input.workspaceId,
      section: input.section,
      content: normalizeBriefContent(input.content),
      updated_by: input.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id,section' }
  );
  if (error) {
    console.error('[team-brief] could not save section:', error.message);
    return { ok: false, error: 'Could not save. Try again.' };
  }
  return { ok: true };
}

/**
 * Brief completion for many teams at once, for internal account views.
 *
 * ONE query for every workspace asked about, grouped in JS: the admin console
 * lists every team on the platform, and a per-team read would be a query per
 * row. Teams with no rows at all are returned as 0% rather than omitted — a
 * missing key in an admin table reads as "unknown", and the honest answer is
 * "nothing written".
 *
 * Never throws: an unapplied migration or a failed read degrades to an empty
 * map, and the caller renders every team as 0%. A billing console must not go
 * down because a brief could not be counted.
 */
export async function loadBriefCompletionByWorkspace(
  adminClient: SupabaseClient,
  workspaceIds: string[]
): Promise<Map<string, TeamBriefCompletion>> {
  const result = new Map<string, TeamBriefCompletion>();
  const ids = Array.from(new Set(workspaceIds.filter(Boolean)));
  if (!ids.length) return result;

  const empty = briefCompletion([]);
  for (const id of ids) result.set(id, empty);

  try {
    const { data, error } = await adminClient
      .from(TABLE)
      .select('workspace_id,section,content')
      .in('workspace_id', ids);
    if (error) throw error;

    const rowsByWorkspace = new Map<string, TeamBriefEntry[]>();
    for (const row of (Array.isArray(data) ? data : []) as Array<{
      workspace_id: string;
      section: string;
      content: string | null;
    }>) {
      if (!isTeamBriefSection(row.section)) continue;
      const list = rowsByWorkspace.get(row.workspace_id) || [];
      list.push({
        section: row.section,
        content: normalizeBriefContent(row.content),
        updatedAt: null,
        updatedByName: null,
      });
      rowsByWorkspace.set(row.workspace_id, list);
    }

    for (const [workspaceId, entries] of rowsByWorkspace) {
      result.set(workspaceId, briefCompletion(entries));
    }
    return result;
  } catch (error) {
    console.error('[team-brief] could not count completion:', error);
    return result;
  }
}
