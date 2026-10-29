import { NextResponse, type NextRequest } from 'next/server';
import { listWorkspaceArtists } from '@/lib/artists-server';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { normalizeKitSlug } from '@/lib/press-kits';
import { applyAutofill } from '@/lib/press-kit-autofill-server';
import { PRESS_KIT_SECTIONS, type PressKitSection } from '@/types/press-kits';
import {
  asRow,
  PRESS_KITS_TABLE,
  PRESS_KIT_COLUMNS,
  PRESS_KIT_SECTIONS_TABLE,
  buildInitialSectionRows,
  createAdminClient,
  isPressKitsFeatureEnabled,
  pressKitsDisabledResponse,
  requireActiveAuthenticatedUser,
  toPressKit,
} from './_shared';

/**
 * The roster, with each artist's kit beside them.
 *
 * An artist with no kit yet is returned with `kit: null` rather than being
 * left out, because the list page's job is to show the whole roster and offer
 * the missing ones. Nothing is created by reading.
 */
export async function GET(request: NextRequest) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  if (!access.primaryWorkspaceId) {
    return NextResponse.json({ entries: [] });
  }

  const roster = await listWorkspaceArtists(adminClient, access.primaryWorkspaceId);

  // An artist-scoped teammate sees their artist and nobody else's, matching
  // what decideReleaseAccess would allow them on the kit itself.
  const scopedArtistId = access.artistScopeByWorkspaceId[access.primaryWorkspaceId] || null;
  // Kits are artist-wide: a member limited to chosen rollouts (#853) sees none.
  const visible = access.releaseScopeByWorkspaceId[access.primaryWorkspaceId]
    ? []
    : scopedArtistId
      ? roster.filter((artist) => artist.id === scopedArtistId)
      : roster;

  if (visible.length === 0) {
    return NextResponse.json({ entries: [] });
  }

  const { data, error } = await adminClient
    .from(PRESS_KITS_TABLE)
    .select(PRESS_KIT_COLUMNS)
    .in(
      'artist_id',
      visible.map((artist) => artist.id)
    );

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load press kits.' },
      { status: 500 }
    );
  }

  const kitByArtist = new Map<string, Record<string, unknown>>();
  for (const row of data || []) {
    const record = asRow(row);
    kitByArtist.set(String(record.artist_id || ''), record);
  }

  return NextResponse.json({
    entries: visible.map((artist) => {
      const row = kitByArtist.get(artist.id);
      return {
        artistId: artist.id,
        artistName: artist.name,
        kit: row ? toPressKit(row, artist.name) : null,
      };
    }),
  });
}

/** Try the artist's own name first, then a numbered variant. The slug is
 *  globally unique, so a common artist name really can be taken by another
 *  team, and the team can rename it afterwards. */
const slugCandidates = (name: string, artistId: string): string[] => {
  const base = normalizeKitSlug(name);
  if (!base) return [`artist-${artistId.slice(0, 8)}`];
  return [base, `${base}-2`, `${base}-3`, `${base}-${artistId.slice(0, 6)}`];
};

/**
 * Create the kit for one artist. Idempotent: an artist who already has a kit
 * gets theirs back, since there is only ever one.
 */
export async function POST(request: NextRequest) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const artistId =
    body && typeof body === 'object' && typeof body.artistId === 'string'
      ? body.artistId.trim()
      : '';
  if (!artistId) {
    return NextResponse.json({ error: 'Which artist is this kit for?' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const access = await loadWorkspaceAccessContext(adminClient, auth.user);
  if (!access.primaryWorkspaceId) {
    return NextResponse.json({ error: 'No team found.' }, { status: 400 });
  }

  // The artist has to be on the CALLER'S roster, resolved this way rather than
  // by reading the artist row and comparing afterwards, so an artist on another
  // team is indistinguishable from one that does not exist (the events rule).
  const roster = await listWorkspaceArtists(adminClient, access.primaryWorkspaceId);
  const artist = roster.find((candidate) => candidate.id === artistId);
  if (!artist) {
    return NextResponse.json({ error: 'That artist is not on your roster.' }, { status: 404 });
  }
  const scopedArtistId = access.artistScopeByWorkspaceId[access.primaryWorkspaceId] || null;
  if ((scopedArtistId && scopedArtistId !== artist.id) || access.releaseScopeByWorkspaceId[access.primaryWorkspaceId]) {
    return NextResponse.json({ error: 'That artist is not on your roster.' }, { status: 404 });
  }

  const existing = await adminClient
    .from(PRESS_KITS_TABLE)
    .select(PRESS_KIT_COLUMNS)
    .eq('artist_id', artist.id)
    .maybeSingle();

  if (existing.error) {
    return NextResponse.json(
      { error: existing.error.message || 'Could not load the press kit.' },
      { status: 500 }
    );
  }
  if (existing.data) {
    return NextResponse.json(
      { kit: toPressKit(asRow(existing.data), artist.name) },
      { status: 200 }
    );
  }

  // STAMPED WITH THE ARTIST'S OWNER, never the acting teammate. Every account
  // owns a personal team, so a kit owned by whoever happened to create it would
  // sit where nobody else can read it.
  const ownerUserId = artist.ownerUserId || auth.user.id;

  let created: Record<string, unknown> | null = null;
  let lastError = '';
  for (const slug of slugCandidates(artist.name, artist.id)) {
    const attempt = await adminClient
      .from(PRESS_KITS_TABLE)
      .insert({ owner_user_id: ownerUserId, artist_id: artist.id, slug })
      .select(PRESS_KIT_COLUMNS)
      .maybeSingle();

    if (!attempt.error && attempt.data) {
      created = asRow(attempt.data);
      break;
    }
    lastError = attempt.error?.message || '';
    // 23505 is either the slug being taken by another team, which the next
    // candidate answers, or another request creating this artist's kit first,
    // which the re-read below answers.
    if (attempt.error?.code !== '23505') break;

    const raced = await adminClient
      .from(PRESS_KITS_TABLE)
      .select(PRESS_KIT_COLUMNS)
      .eq('artist_id', artist.id)
      .maybeSingle();
    if (raced.data) {
      return NextResponse.json(
        { kit: toPressKit(asRow(raced.data), artist.name) },
        { status: 200 }
      );
    }
  }

  if (!created) {
    return NextResponse.json(
      { error: lastError || 'Could not create the press kit.' },
      { status: 500 }
    );
  }

  const kitId = String(created.id || '');
  const sections = await adminClient
    .from(PRESS_KIT_SECTIONS_TABLE)
    .insert(buildInitialSectionRows(kitId, ownerUserId));

  if (sections.error) {
    // The kit without its sections is a shell nothing can edit, so do not leave
    // one behind for the next request to trip over.
    await adminClient.from(PRESS_KITS_TABLE).delete().eq('id', kitId);
    return NextResponse.json(
      { error: sections.error.message || 'Could not set up the press kit.' },
      { status: 500 }
    );
  }

  // Fill what the product already knows before anyone sees the kit, so it is
  // never shown as twelve empty boxes. The rows were just inserted untouched,
  // so their state is known without reading them back.
  //
  // Deliberately cannot fail the create: a kit with empty sections is a working
  // kit, and applyAutofill never throws (see lib/press-kit-autofill-server.ts).
  const freshSections = PRESS_KIT_SECTIONS.map(
    (section, index): PressKitSection => ({
      id: '',
      section,
      content: {},
      publishedContent: null,
      status: 'empty',
      source: 'autofill',
      position: index + 1,
      hidden: false,
      updatedBy: null,
      updatedAt: '',
    })
  );

  const autofill = await applyAutofill(adminClient, {
    kitId,
    artistId: artist.id,
    workspaceId: access.primaryWorkspaceId,
    ownerUserId,
    sections: freshSections,
  });

  return NextResponse.json(
    { kit: toPressKit(created, artist.name), autofill },
    { status: 201 }
  );
}
