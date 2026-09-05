import { NextResponse, type NextRequest } from 'next/server';
import { deriveSectionStatus, versionPruneCutoffIso } from '@/lib/press-kits';
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
  PRESS_KIT_SECTION_VERSION_COLUMNS,
  pressKitsDisabledResponse,
  requireActiveAuthenticatedUser,
  toPressKitSection,
} from '../../../../_shared';

type Context = { params: Promise<{ kitId: string; section: string }> };

/** How far back the list goes. Thirty days of history is a short list by
 *  design, so this is a guard against a runaway rather than a page size. */
const VERSION_LIST_LIMIT = 50;

const resolveSection = async (
  request: NextRequest,
  context: Context,
  write: boolean
) => {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return { error: auth.error } as const;

  const { kitId, section } = await context.params;
  if (!kitId || !isPressKitSectionKey(section)) {
    return {
      error: NextResponse.json(
        { error: 'That is not a section of a press kit.' },
        { status: 400 }
      ),
    } as const;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, write);
  if ('error' in access) return { error: access.error } as const;

  const current = await adminClient!
    .from(PRESS_KIT_SECTIONS_TABLE)
    .select(PRESS_KIT_SECTION_COLUMNS)
    .eq('kit_id', kitId)
    .eq('section', section)
    .maybeSingle();

  if (current.error) {
    return {
      error: NextResponse.json(
        { error: current.error.message || 'Could not load the section.' },
        { status: 500 }
      ),
    } as const;
  }
  if (!current.data) {
    return {
      error: NextResponse.json({ error: 'That section is not set up yet.' }, { status: 404 }),
    } as const;
  }

  return {
    admin: adminClient!,
    auth,
    access,
    kitId,
    section,
    existing: toPressKitSection(asRow(current.data)),
  } as const;
};

/** What this section used to say, newest first. */
export async function GET(request: NextRequest, context: Context) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const resolved = await resolveSection(request, context, false);
  if ('error' in resolved) return resolved.error;

  const { data, error } = await resolved.admin
    .from(PRESS_KIT_SECTION_VERSIONS_TABLE)
    .select(PRESS_KIT_SECTION_VERSION_COLUMNS)
    .eq('section_id', resolved.existing.id)
    .gte('created_at', versionPruneCutoffIso())
    .order('created_at', { ascending: false })
    .limit(VERSION_LIST_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load the history.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    versions: (data || []).map((row) => {
      const record = asRow(row);
      return {
        id: String(record.id || ''),
        sectionId: String(record.section_id || ''),
        content:
          record.content && typeof record.content === 'object'
            ? (record.content as Record<string, unknown>)
            : {},
        savedBy: record.saved_by ? String(record.saved_by) : null,
        createdAt: String(record.created_at || ''),
      };
    }),
  });
}

/**
 * Put a previous version back.
 *
 * The content being replaced is filed first, unconditionally, so a restore is
 * itself undoable. This is the one write that never coalesces: pressing
 * restore is a deliberate act and must always leave a way back.
 */
export async function POST(request: NextRequest, context: Context) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const body = await request.json().catch(() => null);
  const versionId =
    body && typeof body === 'object' && typeof body.versionId === 'string'
      ? body.versionId.trim()
      : '';
  if (!versionId) {
    return NextResponse.json({ error: 'Which version do you want back?' }, { status: 400 });
  }

  const resolved = await resolveSection(request, context, true);
  if ('error' in resolved) return resolved.error;
  const { admin, auth, access, kitId, section, existing } = resolved;

  const version = await admin
    .from(PRESS_KIT_SECTION_VERSIONS_TABLE)
    .select(PRESS_KIT_SECTION_VERSION_COLUMNS)
    .eq('id', versionId)
    // Scoped to this section, so a version id from another kit reads as
    // missing rather than being restored across kits.
    .eq('section_id', existing.id)
    .maybeSingle();

  if (version.error) {
    return NextResponse.json(
      { error: version.error.message || 'Could not load that version.' },
      { status: 500 }
    );
  }
  if (!version.data) {
    return NextResponse.json({ error: 'That version is no longer here.' }, { status: 404 });
  }

  const restored = asRow(version.data).content;
  const content =
    restored && typeof restored === 'object' && !Array.isArray(restored)
      ? (restored as Record<string, unknown>)
      : {};

  await admin.from(PRESS_KIT_SECTION_VERSIONS_TABLE).insert({
    owner_user_id: access.ownerUserId,
    section_id: existing.id,
    content: existing.content,
    saved_by: auth.user.id,
  });

  let photoCount = 0;
  if (section === 'assets') {
    const { count } = await admin
      .from(PRESS_KIT_ASSETS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('kit_id', kitId);
    photoCount = count || 0;
  }

  const { data, error } = await admin
    .from(PRESS_KIT_SECTIONS_TABLE)
    .update({
      content,
      status: deriveSectionStatus(section, content, { photoCount }),
      source: 'user',
      updated_by: auth.user.id,
    })
    .eq('id', existing.id)
    .select(PRESS_KIT_SECTION_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not put that version back.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ section: toPressKitSection(asRow(data)) });
}
