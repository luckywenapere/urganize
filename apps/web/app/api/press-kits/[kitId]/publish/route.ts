import { NextResponse, type NextRequest } from 'next/server';
import { canPublishKit } from '@/lib/press-kits';
import {
  PRESS_KITS_TABLE,
  PRESS_KIT_COLUMNS,
  PRESS_KIT_SECTIONS_TABLE,
  PRESS_KIT_SECTION_COLUMNS,
  asRow,
  createAdminClient,
  ensurePressKitAccess,
  isPressKitsFeatureEnabled,
  pressKitsDisabledResponse,
  requireActiveAuthenticatedUser,
  toPressKit,
  toPressKitSection,
} from '../../_shared';

/**
 * Publishing a kit, and taking it back down.
 *
 * Publishing COPIES `content` into `published_content` for every section. That
 * copy is the whole point of the two columns: the team keeps editing, and the
 * public page keeps showing the last thing somebody deliberately released
 * rather than whatever is half typed right now.
 *
 * The copy includes hidden and empty sections. Hidden is a display decision the
 * public page makes at render time, so a section hidden today and shown next
 * week must already carry its published copy rather than reappearing blank.
 */

type Context = { params: Promise<{ kitId: string }> };

export async function POST(request: NextRequest, context: Context) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { kitId } = await context.params;
  if (!kitId) {
    return NextResponse.json({ error: 'Press kit id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, true);
  if ('error' in access) return access.error;

  const { data: sectionData, error: sectionError } = await adminClient
    .from(PRESS_KIT_SECTIONS_TABLE)
    .select(PRESS_KIT_SECTION_COLUMNS)
    .eq('kit_id', kitId)
    .order('position', { ascending: true });

  if (sectionError) {
    return NextResponse.json(
      { error: sectionError.message || 'Could not read the press kit.' },
      { status: 500 }
    );
  }

  const sections = (sectionData || []).map((row) => toPressKitSection(asRow(row)));

  // The one precondition, and it is checked on the SERVER rather than only in
  // the button's disabled state: a kit whose reader cannot find who to email is
  // a dead end, which is the single thing the brief makes a rule.
  const allowed = canPublishKit(sections);
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.reason }, { status: 400 });
  }

  // One statement per section rather than a bulk upsert: an upsert would need
  // every column of every row restated, and getting that wrong writes over
  // somebody's content with a default. Twelve small updates is the boring
  // version, and a kit has exactly twelve.
  for (const section of sections) {
    const { error } = await adminClient
      .from(PRESS_KIT_SECTIONS_TABLE)
      .update({ published_content: section.content })
      .eq('id', section.id)
      .eq('kit_id', kitId);
    if (error) {
      return NextResponse.json(
        { error: error.message || 'Could not publish the press kit.' },
        { status: 500 }
      );
    }
  }

  const { data, error } = await adminClient
    .from(PRESS_KITS_TABLE)
    .update({ state: 'published', published_at: new Date().toISOString() })
    .eq('id', kitId)
    .select(PRESS_KIT_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not publish the press kit.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ kit: toPressKit(asRow(data)) });
}

/**
 * Take the kit down.
 *
 * `published_at` is cleared, so /k/{slug} goes back to a 404. The published
 * copy on each section is deliberately LEFT in place: taking a kit down is not
 * the same as discarding what was on it, and a manager who publishes again
 * within the hour should not have to rebuild anything. Nothing reads it while
 * the kit is down.
 */
export async function DELETE(request: NextRequest, context: Context) {
  if (!isPressKitsFeatureEnabled()) return pressKitsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { kitId } = await context.params;
  if (!kitId) {
    return NextResponse.json({ error: 'Press kit id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensurePressKitAccess(adminClient, kitId, auth.user, true);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient
    .from(PRESS_KITS_TABLE)
    .update({ state: 'ready', published_at: null })
    .eq('id', kitId)
    .select(PRESS_KIT_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not take the press kit down.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ kit: toPressKit(asRow(data)) });
}
