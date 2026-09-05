import { NextResponse, type NextRequest } from 'next/server';
import {
  deriveSectionStatus,
  shouldCoalesceVersion,
  versionPruneCutoffIso,
} from '@/lib/press-kits';
import {
  asRow,
  createAdminClient,
  ensurePressKitAccess,
  isPressKitSectionKey,
  isPressKitsFeatureEnabled,
  PRESS_KIT_ASSETS_TABLE,
  PRESS_KIT_SECTIONS_TABLE,
  PRESS_KIT_SECTION_COLUMNS,
  PRESS_KIT_SECTION_VERSIONS_TABLE,
  pressKitsDisabledResponse,
  requireActiveAuthenticatedUser,
  toPressKitSection,
} from '../../../_shared';

type Context = { params: Promise<{ kitId: string; section: string }> };

/**
 * Save one section.
 *
 * This is the autosave target, so it is called every eight hundred
 * milliseconds while somebody types. Three things happen in order, and the
 * order is the point:
 *
 *  1. The content that is about to be replaced is filed as a version, unless a
 *     recent version by the same person already covers this sitting. Without
 *     that check the history would gain a row per keystroke.
 *  2. Anything past the retention window is deleted, here rather than on a
 *     cron: the plan allows one cron a day and both slots are taken.
 *  3. The section is updated, and its status is recomputed server-side so a
 *     client cannot report a section as ready that is not.
 */
export async function PATCH(request: NextRequest, context: Context) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { kitId, section } = await context.params;
  if (!kitId || !isPressKitSectionKey(section)) {
    return NextResponse.json({ error: 'That is not a section of a press kit.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send what you want to save.' }, { status: 400 });
  }

  const wantsContent = 'content' in body;
  if (
    wantsContent &&
    (!body.content || typeof body.content !== 'object' || Array.isArray(body.content))
  ) {
    return NextResponse.json({ error: 'Send the section as an object.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, true);
  if ('error' in access) return access.error;
  const admin = adminClient!;

  const current = await admin
    .from(PRESS_KIT_SECTIONS_TABLE)
    .select(PRESS_KIT_SECTION_COLUMNS)
    .eq('kit_id', kitId)
    .eq('section', section)
    .maybeSingle();

  if (current.error) {
    return NextResponse.json(
      { error: current.error.message || 'Could not load the section.' },
      { status: 500 }
    );
  }
  if (!current.data) {
    return NextResponse.json({ error: 'That section is not set up yet.' }, { status: 404 });
  }

  const existing = toPressKitSection(asRow(current.data));
  const patch: Record<string, unknown> = {};

  if (wantsContent) {
    const newest = await admin
      .from(PRESS_KIT_SECTION_VERSIONS_TABLE)
      .select('created_at,saved_by')
      .eq('section_id', existing.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const newestRow = newest.data ? asRow(newest.data) : null;
    const coalesce = shouldCoalesceVersion(
      newestRow
        ? {
            createdAt: String(newestRow.created_at || ''),
            savedBy: newestRow.saved_by ? String(newestRow.saved_by) : null,
          }
        : null,
      auth.user.id
    );

    // Only file a version when there is something to go back to. The row holds
    // the content as it was BEFORE this save, so restoring gives back the
    // wording somebody had rather than the one they just replaced it with.
    if (!coalesce && Object.keys(existing.content).length > 0) {
      await admin.from(PRESS_KIT_SECTION_VERSIONS_TABLE).insert({
        owner_user_id: access.ownerUserId,
        section_id: existing.id,
        content: existing.content,
        saved_by: auth.user.id,
      });

      await admin
        .from(PRESS_KIT_SECTION_VERSIONS_TABLE)
        .delete()
        .eq('section_id', existing.id)
        .lt('created_at', versionPruneCutoffIso());
    }

    const content = body.content as Record<string, unknown>;
    let photoCount = 0;
    if (section === 'assets') {
      const { count } = await admin
        .from(PRESS_KIT_ASSETS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('kit_id', kitId);
      photoCount = count || 0;
    }

    patch.content = content;
    patch.status = deriveSectionStatus(section, content, { photoCount });
    // A person typed this, so autofill and a release roll-in must leave it
    // alone from here on.
    patch.source = 'user';
    patch.updated_by = auth.user.id;
  }

  if ('hidden' in body) patch.hidden = body.hidden === true;
  if ('position' in body && Number.isFinite(Number(body.position))) {
    patch.position = Math.max(0, Math.trunc(Number(body.position)));
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  const { data, error } = await admin
    .from(PRESS_KIT_SECTIONS_TABLE)
    .update(patch)
    .eq('id', existing.id)
    .select(PRESS_KIT_SECTION_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save the section.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ section: toPressKitSection(asRow(data)) });
}
