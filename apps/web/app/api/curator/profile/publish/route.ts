import { NextRequest, NextResponse } from 'next/server';
import { suggestCuratorSlug } from '@/lib/curator-public';
import { isCuratorPageFeatureEnabled } from '@/lib/curator-public-server';
import {
  CURATOR_PROFILES_TABLE,
  CURATOR_PROFILE_COLUMNS,
  flagOffResponse,
  requireCuratorUser,
} from '../../_shared';

/**
 * Publish and unpublish a curator's public page at /pitch/{slug}.
 *
 * A DEDICATED ROUTE rather than a field on the profile PATCH, and that is the
 * decision to keep. The profile form autosaves, and anything reachable from a
 * save can happen without the person meaning it — here that would mean putting
 * her name, her photo and her playlists on the public internet by accident.
 * The capture page's rotate control is split out for the same reason.
 *
 * UNPUBLISHING LEAVES THE SLUG. She will have posted this link to a WhatsApp
 * status and to a few DMs; taking the page down must not burn the URL, so
 * published_at is the gate and the slug is untouched. Publishing again restores
 * the same address, which is the whole reason the migration spends two columns
 * on this instead of one.
 */

/**
 * Candidate handles, in the order we will try them.
 *
 * A ladder rather than a refusal, because publishing is ONE TAP and there is no
 * handle field on screen at that moment: answering "that link is taken" would
 * name a thing she never chose and cannot see, which is the dead end the
 * directory's opt-in hit and fixed. A handle she types later gets the honest
 * 409 from the profile PATCH, because that one she can act on.
 */
function slugCandidates(displayName: string, userId: string): string[] {
  const base = suggestCuratorSlug(displayName);
  if (!base) return [`curator-${userId.slice(0, 8)}`];
  return [base, `${base}-2`, `${base}-3`, `${base}-${userId.slice(0, 6)}`];
}

export async function POST(request: NextRequest) {
  if (!isCuratorPageFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const { data: current, error: readError } = await auth.adminClient
    .from(CURATOR_PROFILES_TABLE)
    .select(CURATOR_PROFILE_COLUMNS)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: 'Could not publish your page.' }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: 'Your profile is not set up yet.' }, { status: 404 });
  }

  const existingSlug = typeof current.slug === 'string' ? current.slug : '';
  const displayName = typeof current.display_name === 'string' ? current.display_name : '';
  const publishedAt = new Date().toISOString();

  // Already has a handle: publishing is a one-column write and cannot collide.
  if (existingSlug) {
    const { data, error } = await auth.adminClient
      .from(CURATOR_PROFILES_TABLE)
      .update({ published_at: publishedAt })
      .eq('user_id', auth.user.id)
      .select(CURATOR_PROFILE_COLUMNS)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Could not publish your page.' }, { status: 500 });
    }
    return NextResponse.json({ slug: existingSlug, publishedAt });
  }

  for (const candidate of slugCandidates(displayName, auth.user.id)) {
    const { data, error } = await auth.adminClient
      .from(CURATOR_PROFILES_TABLE)
      .update({ slug: candidate, published_at: publishedAt })
      .eq('user_id', auth.user.id)
      .select(CURATOR_PROFILE_COLUMNS)
      .maybeSingle();

    if (!error && data) {
      return NextResponse.json({ slug: candidate, publishedAt });
    }
    // Anything but a taken handle is a real failure and should not be retried
    // three more times.
    if (error?.code !== '23505') break;
  }

  return NextResponse.json(
    { error: 'Could not find a free link for your page. Pick one yourself and try again.' },
    { status: 409 }
  );
}

export async function DELETE(request: NextRequest) {
  if (!isCuratorPageFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const { data, error } = await auth.adminClient
    .from(CURATOR_PROFILES_TABLE)
    // The slug is deliberately NOT cleared. See the header.
    .update({ published_at: null })
    .eq('user_id', auth.user.id)
    .select(CURATOR_PROFILE_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Could not take your page down.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Your profile is not set up yet.' }, { status: 404 });
  }

  return NextResponse.json({ slug: typeof data.slug === 'string' ? data.slug : null, publishedAt: null });
}
