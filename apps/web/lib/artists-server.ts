import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeReleaseSlug } from '@/lib/release-ops';
import { checkLimit, type LimitVerdict } from '@/lib/entitlements';
import { getWorkspaceTier } from '@/lib/team-billing-server';

export const ARTISTS_TABLE = 'artists';
export const RELEASES_TABLE = 'releases';
export const RELEASE_METADATA_TABLE = 'release_metadata';

export type WorkspaceArtist = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  name: string;
  slug: string;
};

const ARTIST_COLUMNS = 'id,workspace_id,owner_user_id,name,slug';

function toWorkspaceArtist(row: Record<string, unknown>): WorkspaceArtist {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id || ''),
    ownerUserId: String(row.owner_user_id || ''),
    name: String(row.name || ''),
    slug: String(row.slug || ''),
  };
}

/**
 * Every artist on a team, oldest first.
 *
 * Oldest-first is load-bearing rather than cosmetic: the first row is the
 * team's original artist, which is what `getWorkspaceArtist` has always
 * returned and what the implicit-artist path on release creation still falls
 * back to. Reordering this would silently change which artist an API call that
 * names none is filed under.
 *
 * Returns [] on any read failure. Callers render an empty roster rather than an
 * error, matching how `getWorkspaceArtist` has always swallowed its errors —
 * and the caller that matters (Settings) has its own error surface anyway.
 */
export async function listWorkspaceArtists(
  adminClient: SupabaseClient,
  workspaceId: string
): Promise<WorkspaceArtist[]> {
  if (!workspaceId) return [];
  const { data, error } = await adminClient
    .from(ARTISTS_TABLE)
    .select(ARTIST_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (error || !Array.isArray(data)) return [];
  return data.map((row) => toWorkspaceArtist(row as Record<string, unknown>));
}

/**
 * How many artists a team has, or null when it cannot be read.
 *
 * Null means "do not enforce", exactly as `countTeamSeats` documents: turning a
 * transient database blip into a team that cannot add an artist is worse than
 * briefly allowing one too many.
 */
export async function countWorkspaceArtists(
  adminClient: SupabaseClient,
  workspaceId: string
): Promise<number | null> {
  if (!workspaceId) return null;
  try {
    const { count, error } = await adminClient
      .from(ARTISTS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);
    if (error) {
      console.error('[artists] could not count workspace artists:', error.message);
      return null;
    }
    return count ?? 0;
  } catch (error) {
    console.error('[artists] could not count workspace artists:', error);
    return null;
  }
}

/**
 * Is this team allowed one more artist?
 *
 * Shared by BOTH places an artist can be created, which is the entire point:
 * `POST /api/workspace/artists` is the one a person uses, and the
 * lookup-or-create branch inside `POST /api/releases` will mint an artist for
 * any caller that sends a name we have not seen. Capping only the first leaves
 * the second open — the exact hole the seat cap had to close across two routes,
 * and the reason this lives beside the counter rather than in a route file.
 *
 * FAILS OPEN twice, deliberately, mirroring `checkSeatAllowance`: an
 * unresolvable tier and an unreadable count both return allowed, because
 * refusing on a database blip is worse than briefly allowing one artist too
 * many.
 */
export async function checkArtistAllowance(
  adminClient: SupabaseClient,
  workspaceId: string
): Promise<LimitVerdict> {
  const allowed: LimitVerdict = { allowed: true, limit: null, current: 0, remaining: null };

  const tier = await getWorkspaceTier(workspaceId);
  if (!tier) return allowed;

  const current = await countWorkspaceArtists(adminClient, workspaceId);
  if (current === null) return allowed;

  return checkLimit({ tier, key: 'artists', current });
}

/**
 * Adds an artist to a team.
 *
 * Does NOT check the tier ceiling — that is the route's job, because the two
 * creation points (this, and the lookup-or-create inside `POST /api/releases`)
 * need to report a refusal differently. Mixing the cap in here would make the
 * cheaper of those two paths silently authoritative.
 *
 * The `conflict` flag mirrors `renameWorkspaceArtist`: the partial unique index
 * on (workspace_id, slug) is the real guard, the pre-check is only there to
 * produce a readable message, and 23505 is the backstop for the race between
 * them.
 */
export async function createWorkspaceArtist(
  adminClient: SupabaseClient,
  input: { workspaceId: string; ownerUserId: string; name: string }
): Promise<{ data: WorkspaceArtist | null; error: string | null; conflict?: boolean }> {
  const trimmed = input.name.trim();
  if (!trimmed) {
    return { data: null, error: 'Artist name cannot be empty.' };
  }
  if (trimmed.length > 120) {
    return { data: null, error: 'Artist name must be 120 characters or fewer.' };
  }

  const slug = normalizeReleaseSlug(trimmed) || `artist-${Date.now()}`;

  const existing = await adminClient
    .from(ARTISTS_TABLE)
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('slug', slug)
    .maybeSingle();

  if (existing.data) {
    return {
      data: null,
      error: `An artist named "${trimmed}" is already on your roster.`,
      conflict: true,
    };
  }

  const inserted = await adminClient
    .from(ARTISTS_TABLE)
    .insert({
      owner_user_id: input.ownerUserId,
      workspace_id: input.workspaceId,
      name: trimmed,
      slug,
      updated_at: new Date().toISOString(),
    })
    .select(ARTIST_COLUMNS)
    .single();

  if (inserted.error || !inserted.data) {
    const code = String((inserted.error as { code?: string } | null)?.code || '');
    if (code === '23505') {
      return {
        data: null,
        error: `An artist named "${trimmed}" is already on your roster.`,
        conflict: true,
      };
    }
    return { data: null, error: inserted.error?.message || 'Could not add artist.' };
  }

  return { data: toWorkspaceArtist(inserted.data as Record<string, unknown>), error: null };
}

/**
 * Returns the workspace's FIRST artist row, or null when none exists.
 *
 * This predates multi-artist and is deliberately kept: it is the fallback for
 * an API caller that creates a release without naming an artist, and it backs
 * the identity card's unscoped read. `.order('created_at')` means "the team's
 * original artist" rather than a race on physical row order — which was written
 * as a defensive measure and became the actual contract when rosters landed.
 *
 * Anything that needs the whole roster wants `listWorkspaceArtists`.
 */
export async function getWorkspaceArtist(
  adminClient: SupabaseClient,
  workspaceId: string
): Promise<WorkspaceArtist | null> {
  const { data, error } = await adminClient
    .from(ARTISTS_TABLE)
    .select(ARTIST_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return toWorkspaceArtist(data as Record<string, unknown>);
}

type RenameResult = {
  artist: WorkspaceArtist;
  releasesUpdated: number;
};

type RenameOutcome = {
  data: RenameResult | null;
  error: string | null;
  /**
   * True when the rename was rejected because another artist row in the same
   * workspace already owns the target slug. Surfaced to the API so it can
   * return HTTP 409 instead of 400/500. Schema's partial unique index
   * (workspace_id, slug) WHERE workspace_id IS NOT NULL enforces this; the
   * pre-check below is a friendlier UX path, and the 23505 backstop covers
   * the race between SELECT and UPDATE.
   */
  conflict?: boolean;
};

/**
 * Renames an artist row and writes-through to every cached field that
 * denormalizes the artist name:
 *
 *   - artists.name (canonical)
 *   - artists.slug (derived from the new name)
 *   - releases.artist_name (denormalized cache on every release row)
 *   - release_metadata.primary_artist_name (denormalized cache on the
 *     metadata sidecar for every release)
 *
 * The caller is responsible for authorizing the action (workspace ownership
 * check). This helper does not consult RLS — it uses the service-role client
 * passed in. Idempotent: if the new name equals the current one, no row
 * mutations happen but the function still returns the canonical artist row.
 */
export async function renameWorkspaceArtist(
  adminClient: SupabaseClient,
  artistId: string,
  newName: string
): Promise<RenameOutcome> {
  const trimmed = newName.trim();
  if (!trimmed) {
    return { data: null, error: 'Artist name cannot be empty.' };
  }
  if (trimmed.length > 120) {
    return { data: null, error: 'Artist name must be 120 characters or fewer.' };
  }

  // Load current artist row so we can detect no-op and report the canonical
  // shape to the caller.
  const current = await adminClient
    .from(ARTISTS_TABLE)
    .select('id,workspace_id,owner_user_id,name,slug')
    .eq('id', artistId)
    .maybeSingle();

  if (current.error || !current.data) {
    return { data: null, error: 'Artist not found.' };
  }

  const currentRow = current.data;
  const nextSlug = normalizeReleaseSlug(trimmed) || `artist-${Date.now()}`;

  // No-op short-circuit. We still rebuild the cache projection so callers
  // get a consistent shape back.
  if (currentRow.name === trimmed && currentRow.slug === nextSlug) {
    return {
      data: {
        artist: {
          id: String(currentRow.id),
          workspaceId: String(currentRow.workspace_id || ''),
          ownerUserId: String(currentRow.owner_user_id || ''),
          name: String(currentRow.name || ''),
          slug: String(currentRow.slug || ''),
        },
        releasesUpdated: 0,
      },
      error: null,
    };
  }

  // Pre-check: would the new slug collide with a different artist in the
  // same workspace? The schema's partial unique index would catch this
  // anyway (23505 below), but checking first lets us return a friendly
  // message without consuming an UPDATE round-trip. Skipped when the slug
  // isn't changing (no-op shortcut already returned) and when the artist
  // has no workspace_id (rows excluded from the partial unique index).
  if (currentRow.workspace_id && currentRow.slug !== nextSlug) {
    const collision = await adminClient
      .from(ARTISTS_TABLE)
      .select('id,name')
      .eq('workspace_id', currentRow.workspace_id)
      .eq('slug', nextSlug)
      .neq('id', artistId)
      .maybeSingle();

    if (collision.data) {
      return {
        data: null,
        error: `An artist named "${trimmed}" already exists on this team.`,
        conflict: true,
      };
    }
    // collision.error (other than not-found) is swallowed intentionally —
    // the UPDATE will surface any real DB problem, and the 23505 backstop
    // below catches the unique-violation race.
  }

  // 1. Canonical update on artists.
  const updateArtist = await adminClient
    .from(ARTISTS_TABLE)
    .update({ name: trimmed, slug: nextSlug, updated_at: new Date().toISOString() })
    .eq('id', artistId)
    .select('id,workspace_id,owner_user_id,name,slug')
    .single();

  if (updateArtist.error || !updateArtist.data) {
    // Backstop for the SELECT→UPDATE race: another writer can insert a
    // colliding row between our pre-check and our UPDATE. Match by the
    // Postgres SQLSTATE code, not by the constraint name string — the
    // index name could be renamed in a future migration and we'd silently
    // start leaking raw DB text. 23505 = unique_violation.
    const updateErrorCode = String((updateArtist.error as { code?: string } | null)?.code || '');
    if (updateErrorCode === '23505') {
      return {
        data: null,
        error: `An artist named "${trimmed}" already exists on this team.`,
        conflict: true,
      };
    }
    return {
      data: null,
      error: updateArtist.error?.message || 'Could not rename artist.',
    };
  }

  // 2. Write-through to releases.artist_name. Returns the count of rows
  //    touched so the caller can surface it for debugging.
  const updateReleases = await adminClient
    .from(RELEASES_TABLE)
    .update({ artist_name: trimmed, updated_at: new Date().toISOString() })
    .eq('artist_id', artistId)
    .select('id');

  const releasesUpdated = Array.isArray(updateReleases.data) ? updateReleases.data.length : 0;

  // 3. Write-through to release_metadata.primary_artist_name for the same
  //    releases. Best-effort: if the metadata sidecar fails, we still keep
  //    the artists / releases updates — they're the user-visible read path.
  if (releasesUpdated > 0) {
    const releaseIds = (updateReleases.data || []).map((row) => String(row.id || ''));
    await adminClient
      .from(RELEASE_METADATA_TABLE)
      .update({ primary_artist_name: trimmed, updated_at: new Date().toISOString() })
      .in('release_id', releaseIds);
  }

  return {
    data: {
      artist: {
        id: String(updateArtist.data.id),
        workspaceId: String(updateArtist.data.workspace_id || ''),
        ownerUserId: String(updateArtist.data.owner_user_id || ''),
        name: String(updateArtist.data.name || ''),
        slug: String(updateArtist.data.slug || ''),
      },
      releasesUpdated,
    },
    error: null,
  };
}

/**
 * Files one release under a different artist.
 *
 * WRITES THE SAME THREE PLACES A RENAME DOES, plus the link itself — and that
 * set is the whole correctness story, so keep it in step with
 * `renameWorkspaceArtist` above:
 *   - releases.artist_id (the link; everything that decides visibility reads
 *     this and nothing else)
 *   - releases.artist_name (the denormalized cache every card and public page
 *     renders)
 *   - release_metadata.primary_artist_name (the same cache on the sidecar)
 *
 * Leaving either cache behind would not throw. The release would simply show
 * the old artist's name everywhere while being filed under the new one, which
 * is worse than an error because nothing would look wrong.
 *
 * THIS CHANGES WHO CAN SEE THE RELEASE. An artist-scoped teammate sees exactly
 * the releases whose artist_id matches their scope, so moving a release grants
 * it to one person's view and removes it from another's. That is why the route
 * calling this is owner-only and says so before it runs.
 *
 * Authorization is the caller's job: this trusts that `releaseId` is owned by
 * the actor and `artistId` is on their roster.
 */
export async function reassignReleaseArtist(
  adminClient: SupabaseClient,
  input: { releaseId: string; artist: WorkspaceArtist }
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();

  const updateRelease = await adminClient
    .from(RELEASES_TABLE)
    .update({
      artist_id: input.artist.id,
      artist_name: input.artist.name,
      updated_at: now,
    })
    .eq('id', input.releaseId)
    .select('id')
    .maybeSingle();

  if (updateRelease.error) {
    return { error: updateRelease.error.message || 'Could not move the rollout.' };
  }
  if (!updateRelease.data) {
    return { error: 'Rollout not found.' };
  }

  // Best-effort, exactly as the rename path treats it: the sidecar is a second
  // copy of a name the release row already carries, and failing the whole
  // request over it would leave the user thinking nothing moved when the link
  // and the visible label both did.
  await adminClient
    .from(RELEASE_METADATA_TABLE)
    .update({ primary_artist_name: input.artist.name, updated_at: now })
    .eq('release_id', input.releaseId);

  return { error: null };
}

export type ArtistDeletionBlocker = {
  /** Releases still filed under this artist. */
  releases: number;
  /** Teammates who can only see this artist's releases. */
  scopedMembers: number;
};

/**
 * What deleting this artist would take with it.
 *
 * BOTH COUNTS ARE REFUSALS, not warnings, and each is a different kind of harm.
 * Shows are not one: Urganize no longer has Shows (Oct 17, 2026), so an
 * artist's leftover show rows go with the artist (deleteArtistShows).
 *
 *
 *   releases — the database would refuse anyway (releases_artist_id_fkey is ON
 *     DELETE RESTRICT as of 20260830100000), but as a raw constraint error. This
 *     is what turns that into a sentence naming the number. Before that
 *     migration the constraint was ON DELETE SET NULL against a NOT NULL column,
 *     so the refusal was an accident of two settings contradicting each other —
 *     see the migration header.
 *
 *   scopedMembers — nothing in the database stops this one, and it is the
 *     quieter harm. `workspace_members.artist_scope_id` is ON DELETE SET NULL,
 *     and NULL there means FULL WORKSPACE VISIBILITY. So deleting an artist
 *     silently promotes everyone scoped to them from "sees one artist" to "sees
 *     everything", with no screen anywhere mentioning it.
 *
 * FAILS CLOSED, unlike every other count in this module. An unreadable count
 * returns null and the caller must refuse: the cost of being wrong here is
 * destroying a link or widening someone's access, neither of which is undoable,
 * whereas the cost of a spurious refusal is that a manager retries.
 */
export async function countArtistDeletionBlockers(
  adminClient: SupabaseClient,
  artistId: string
): Promise<ArtistDeletionBlocker | null> {
  if (!artistId) return null;
  try {
    const [releases, members] = await Promise.all([
      adminClient
        .from(RELEASES_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId),
      adminClient
        .from('workspace_members')
        .select('id', { count: 'exact', head: true })
        .eq('artist_scope_id', artistId)
        .neq('status', 'removed'),
    ]);

    if (releases.error || members.error) {
      console.error(
        '[artists] could not count deletion blockers:',
        releases.error?.message || members.error?.message
      );
      return null;
    }

    return {
      releases: releases.count ?? 0,
      scopedMembers: members.count ?? 0,
    };
  } catch (error) {
    console.error('[artists] could not count deletion blockers:', error);
    return null;
  }
}

/**
 * The refusal message for a blocked delete, or null when it may proceed.
 *
 * Pure, so the wording is testable. Every sentence names a number the manager
 * can act on and says what to do about it — a refusal a user cannot resolve is
 * worse than no button at all.
 */
export function describeArtistDeletionBlock(
  blockers: ArtistDeletionBlocker | null
): string | null {
  if (!blockers) {
    return 'Could not check what this artist is attached to. Try again.';
  }

  const { releases, scopedMembers } = blockers;

  if (releases > 0 && scopedMembers > 0) {
    return `This artist has ${releases} ${releases === 1 ? 'rollout' : 'rollouts'} and ${scopedMembers} ${scopedMembers === 1 ? 'person' : 'people'} who can only see them. Move ${releases === 1 ? 'it' : 'them'} and change that access first.`;
  }
  if (releases > 0) {
    return `This artist has ${releases} ${releases === 1 ? 'rollout' : 'rollouts'}. Move ${releases === 1 ? 'it' : 'them'} to another artist first, or archive ${releases === 1 ? 'it' : 'them'}. Rollouts in Trash count until they are deleted forever.`;
  }
  if (scopedMembers > 0) {
    return `${scopedMembers} ${scopedMembers === 1 ? 'person' : 'people'} can only see this artist. Change their access first, or they will start seeing every rollout.`;
  }
  return null;
}

/**
 * Removes an artist. The caller must have authorized it AND confirmed there is
 * nothing to lose — see countArtistDeletionBlockers.
 *
 * Scoped to the workspace as well as the id so the write itself cannot reach
 * another team's row, matching how the archive route re-asserts ownership on
 * its UPDATE.
 */
export async function deleteWorkspaceArtist(
  adminClient: SupabaseClient,
  input: { artistId: string; workspaceId: string }
): Promise<{ error: string | null }> {
  // Shows go first (Oyin, Oct 17, 2026: Shows were removed from Urganize, so an
  // artist's leftover shows are deleted with the artist rather than blocking
  // it). events.artist_id is ON DELETE RESTRICT, so the artist row cannot go
  // while any show points at it.
  const shows = await deleteArtistShows(adminClient, input.artistId);
  if (shows.error) return shows;

  // Then the song catalog. songs.artist_id is ON DELETE RESTRICT too, and the
  // setlist items that pointed at these songs went with the shows above (a set
  // can only hold its own artist's songs), so nothing still uses them.
  const catalog = await deleteArtistCatalog(adminClient, input.artistId);
  if (catalog.error) return catalog;

  const { error } = await adminClient
    .from(ARTISTS_TABLE)
    .delete()
    .eq('id', input.artistId)
    .eq('workspace_id', input.workspaceId);

  if (error) {
    // 23503 = foreign_key_violation: the RESTRICT backstop fired, which means a
    // release was filed under this artist between our check and this delete.
    const code = String((error as { code?: string }).code || '');
    if (code === '23503') {
      // A rollout was filed under this artist between our check and this delete.
      return {
        error: 'Something was just added to this artist. Check their rollouts, then try again.',
      };
    }
    return { error: error.message || 'Could not remove this artist.' };
  }

  return { error: null };
}

/** Ids per `.in()` call, so a long list never builds an over-long request URL. */
const DELETE_CHUNK = 200;

/**
 * Removes the show rows filed under one artist, as part of deleting that
 * artist. Never called anywhere else: nothing bulk-deletes Shows data.
 *
 * Order matters. dj_packs.setlist_id is ON DELETE RESTRICT, so the packs go
 * before the shows (their recipients and access log cascade from the pack).
 * Deleting the shows then cascades their setlists, setlist items, run of show
 * and any person-directory credits pointing at them.
 */
export async function deleteArtistShows(
  adminClient: SupabaseClient,
  artistId: string
): Promise<{ error: string | null }> {
  if (!artistId) return { error: null };

  const events = await adminClient.from('events').select('id').eq('artist_id', artistId);
  if (events.error) {
    return { error: 'Could not check this artist’s shows. Try again.' };
  }
  const eventIds = (events.data || [])
    .map((row) => String((row as Record<string, unknown>).id || ''))
    .filter(Boolean);
  if (eventIds.length === 0) return { error: null };

  for (let i = 0; i < eventIds.length; i += DELETE_CHUNK) {
    const chunk = eventIds.slice(i, i + DELETE_CHUNK);
    const packs = await adminClient.from('dj_packs').delete().in('event_id', chunk);
    if (packs.error) {
      console.error('[artists] dj pack removal failed', { artistId, message: packs.error.message });
      return { error: 'Could not remove this artist’s shows. Try again.' };
    }
    const shows = await adminClient.from('events').delete().eq('artist_id', artistId).in('id', chunk);
    if (shows.error) {
      console.error('[artists] show removal failed', { artistId, message: shows.error.message });
      return { error: 'Could not remove this artist’s shows. Try again.' };
    }
  }
  return { error: null };
}

/**
 * Removes an artist's song catalog: the files in storage, then the rows (their
 * versions cascade).
 *
 * Storage first and best-effort, the song-version DELETE route's order: a
 * stranded object costs storage, whereas refusing here would leave the artist
 * undeletable over a file nobody can see. A row that will not go is reported
 * rather than swallowed.
 */
export async function deleteArtistCatalog(
  adminClient: SupabaseClient,
  artistId: string
): Promise<{ error: string | null }> {
  if (!artistId) return { error: null };

  const songs = await adminClient.from('songs').select('id').eq('artist_id', artistId);
  if (songs.error) {
    return { error: 'Could not check this artist’s songs. Try again.' };
  }
  const songIds = (songs.data || [])
    .map((row) => String((row as Record<string, unknown>).id || ''))
    .filter(Boolean);
  if (songIds.length === 0) return { error: null };

  const versions = await adminClient
    .from('song_versions')
    .select('storage_bucket,storage_path')
    .in('song_id', songIds);
  if (!versions.error) {
    const byBucket = new Map<string, string[]>();
    for (const entry of versions.data || []) {
      const row = entry as Record<string, unknown>;
      const bucket = String(row.storage_bucket || '');
      const path = String(row.storage_path || '');
      if (!bucket || !path) continue;
      byBucket.set(bucket, [...(byBucket.get(bucket) || []), path]);
    }
    for (const [bucket, paths] of byBucket) {
      const removal = await adminClient.storage.from(bucket).remove(paths);
      if (removal.error) {
        console.error('[artists] song file removal failed', {
          artistId,
          message: removal.error.message,
        });
      }
    }
  }

  const { error } = await adminClient.from('songs').delete().eq('artist_id', artistId);
  if (error) {
    console.error('[artists] song removal failed', { artistId, message: error.message });
    return { error: 'Could not remove this artist’s songs. Try again.' };
  }
  return { error: null };
}

/**
 * True when the workspace-consolidation feature flag is enabled at runtime.
 * Mirrors the inline `process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true'`
 * pattern used elsewhere (app/dashboard/page.tsx, the modal/topbar gates).
 * Centralized here so server routes can read it once and we have a single
 * point to flip when the flag retires.
 */
export const isWorkspaceFeatureEnabled = () =>
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';
