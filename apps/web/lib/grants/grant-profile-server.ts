import type { SupabaseClient } from '@supabase/supabase-js';
import { grantProfileFromRow, type GrantProfile, type GrantProfileRow } from './grant-profile';

// Reads and writes a team's grant profile with the service role. The route that
// calls these has already applied the team and guest rules.

const TABLE = 'grant_profiles';
const COLUMNS = 'country, stage, applicant_types, genres, needs';

type Failure = { ok: false; error: string; status: number };

export async function loadGrantProfile(
  admin: SupabaseClient,
  workspaceId: string
): Promise<{ ok: true; profile: GrantProfile; saved: boolean } | Failure> {
  const { data, error } = await admin.from(TABLE).select(COLUMNS).eq('workspace_id', workspaceId).maybeSingle();
  if (error) return { ok: false, error: 'Could not load your grant profile.', status: 500 };
  return { ok: true, profile: grantProfileFromRow((data as GrantProfileRow | null) ?? null), saved: data !== null };
}

export async function saveGrantProfile(
  admin: SupabaseClient,
  input: { workspaceId: string; actorUserId: string; profile: GrantProfile }
): Promise<{ ok: true; profile: GrantProfile } | Failure> {
  const { profile } = input;
  const { data, error } = await admin
    .from(TABLE)
    .upsert(
      {
        workspace_id: input.workspaceId,
        country: profile.country,
        stage: profile.stage,
        applicant_types: profile.applicantTypes,
        genres: profile.genres,
        needs: profile.needs,
        updated_by: input.actorUserId,
      },
      { onConflict: 'workspace_id' }
    )
    .select(COLUMNS)
    .single();
  if (error || !data) return { ok: false, error: 'Could not save your grant profile.', status: 500 };
  return { ok: true, profile: grantProfileFromRow(data as GrantProfileRow) };
}
