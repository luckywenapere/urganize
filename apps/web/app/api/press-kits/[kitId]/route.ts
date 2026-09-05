import { NextResponse, type NextRequest } from 'next/server';
import { isValidKitSlug } from '@/lib/press-kits';
import { isAiConfigured } from '@/lib/ai/provider';
import { isUrgansActionsEnabled } from '@/lib/urgans-actions/server';
import {
  asRow,
  createAdminClient,
  ensurePressKitAccess,
  isPressKitsFeatureEnabled,
  loadPressKitAssets,
  PRESS_KITS_TABLE,
  PRESS_KIT_COLUMNS,
  PRESS_KIT_SECTIONS_TABLE,
  PRESS_KIT_SECTION_COLUMNS,
  pressKitsDisabledResponse,
  requireActiveAuthenticatedUser,
  toPressKit,
  toPressKitSection,
} from '../_shared';

type Context = { params: Promise<{ kitId: string }> };

const loadArtistName = async (
  adminClient: ReturnType<typeof createAdminClient>,
  artistId: string
): Promise<string> => {
  if (!adminClient || !artistId) return '';
  const { data } = await adminClient
    .from('artists')
    .select('name')
    .eq('id', artistId)
    .maybeSingle();
  return String(asRow(data).name || '');
};

/** The kit and all twelve of its sections, in display order. */
export async function GET(request: NextRequest, context: Context) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { kitId } = await context.params;
  if (!kitId) {
    return NextResponse.json({ error: 'Press kit id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, false);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(PRESS_KIT_SECTIONS_TABLE)
    .select(PRESS_KIT_SECTION_COLUMNS)
    .eq('kit_id', kitId)
    .order('position', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load the press kit.' },
      { status: 500 }
    );
  }

  const artistName = await loadArtistName(adminClient, access.artistId);

  // Photos live in their own table, not in the Assets section's content, so
  // deriveSectionStatus needs the count handed to it. Loading them here rather
  // than from a second request keeps the rail's chips honest on first paint.
  const assetResult = await loadPressKitAssets(adminClient!, kitId);
  const assets = 'assets' in assetResult ? assetResult.assets : [];

  return NextResponse.json({
    kit: toPressKit(access.kit, artistName),
    sections: (data || []).map((row) => toPressKitSection(asRow(row))),
    assets,
    // Whether to OFFER the drafting button at all. A control that is always
    // going to refuse is worse than no control (the repo's own rule, recorded
    // for the iOS install card), and with no model configured the honest path
    // is the manual builder this feature already ships. Entitlement is NOT
    // checked here: a Solo team is shown the button and told plainly what it
    // costs, which is what the locked sheet is for.
    aiAvailable: isUrgansActionsEnabled() && isAiConfigured(),
  });
}

/**
 * The kit's own fields: the public link, who can find it, the embargo, and
 * whether the artist will do interviews. Section content is saved through the
 * section route, not here.
 */
export async function PATCH(request: NextRequest, context: Context) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { kitId } = await context.params;
  if (!kitId) {
    return NextResponse.json({ error: 'Press kit id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send what you want to change.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if ('slug' in body) {
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    if (!isValidKitSlug(slug)) {
      return NextResponse.json(
        {
          error:
            'Use two to sixty characters: lowercase letters, numbers and single hyphens between them.',
        },
        { status: 400 }
      );
    }
    patch.slug = slug;
  }

  if ('visibility' in body) {
    const visibility = String(body.visibility || '');
    if (!['link_only', 'public', 'public_listed'].includes(visibility)) {
      return NextResponse.json({ error: 'Pick who can find this kit.' }, { status: 400 });
    }
    patch.visibility = visibility;
  }

  if ('embargoDate' in body) {
    const raw = body.embargoDate;
    if (raw === null || raw === '') {
      patch.embargo_date = null;
    } else if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      patch.embargo_date = raw;
    } else {
      return NextResponse.json({ error: 'Use a date like 2026-09-30.' }, { status: 400 });
    }
  }

  if ('availableForInterview' in body) {
    patch.available_for_interview = body.availableForInterview === true;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, true);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient!
    .from(PRESS_KITS_TABLE)
    .update(patch)
    .eq('id', kitId)
    .select(PRESS_KIT_COLUMNS)
    .maybeSingle();

  if (error) {
    // The slug is unique across every team, so a common artist name really can
    // already be taken. Say so plainly rather than reporting a server fault.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'That link is taken. Try another one.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Could not save the press kit.' },
      { status: 500 }
    );
  }

  const artistName = await loadArtistName(adminClient, access.artistId);
  return NextResponse.json({ kit: toPressKit(asRow(data), artistName) });
}
