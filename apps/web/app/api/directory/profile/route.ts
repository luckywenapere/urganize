import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { parsePersonProfileInput, slugConflictIsOurs, suggestSlug } from '@/lib/person-profile';
import { bioForPayload, resolveProfileView } from '@/lib/profile-kit';
import { loadKitFactsForUser } from '@/lib/profile-kit-server';
import { canRunEmbeddedAction } from '@/lib/urgans-actions/server';
import {
  PERSON_PROFILES_TABLE,
  PERSON_PROFILE_COLUMNS,
  asRow,
  createAdminClient,
  directoryDisabledResponse,
  isDirectoryFeatureEnabled,
  loadLeadSummary,
  loadProfileRoles,
  loadProfileTypeOverrides,
  requireActiveAuthenticatedUser,
  toPersonProfile,
} from '../_shared';

/**
 * Your own directory profile.
 *
 * GET answers with the profile if there is one and `null` if there is not,
 * rather than 404ing: not having opted in is an ordinary state, not a missing
 * page, and the editor needs to tell those apart to know whether to offer opt
 * in or opt out.
 *
 * PATCH creates the row on first write and updates it after. Opting in IS a
 * write, so there is no separate create endpoint to keep in step.
 *
 * There is deliberately NO route here for reading somebody else's profile.
 * That read has to apply section 10's field rules (a release title shows only
 * where the release is public) and those depend on state RLS cannot see, so it
 * belongs with the directory itself rather than being bolted onto this.
 */

const DRAFT_BIO_ACTION = 'directory.draft_bio';

/**
 * Everything the editor needs about one profile in one answer.
 *
 * `view` is what the directory and the public page actually SHOW: the artist's
 * published press kit laid over the profile's own fields (lib/profile-kit.ts).
 * The editor uses it to point at the kit instead of duplicating its fields, and
 * `profile` stays the person's own stored record, untouched.
 *
 * `canDraftBio` is the server's answer to "may this person use Draft my bio":
 * Manager and up with embedded actions on. A Solo person sees the field and
 * edits by hand, with no button, which is why no client works this out itself.
 */
async function profileResponseBody(
  adminClient: SupabaseClient,
  user: User,
  profile: ReturnType<typeof toPersonProfile>
) {
  profile.profileType =
    (await loadProfileTypeOverrides(adminClient, [user.id])).get(user.id) ?? null;
  const [roles, kit] = await Promise.all([
    loadProfileRoles(adminClient, user.id, profile.roles),
    loadKitFactsForUser(adminClient, user.id),
  ]);
  // This is somebody's OWN claimed profile, but the rule is applied anyway so no
  // read path can carry a bio on a profile nobody has claimed.
  const safe = { ...profile, bio: bioForPayload({ userId: profile.userId, bio: profile.bio }) };
  const view = resolveProfileView(safe, kit);
  // No draft button when the artist's kit already supplies the bio: it would be
  // written to a field the directory then does not show.
  const canDraftBio =
    !view.fromKit.bio && (await canRunEmbeddedAction(adminClient, DRAFT_BIO_ACTION, profile.id, user));
  const summary = await loadLeadSummary(adminClient, user.id, safe, roles);
  return { profile: safe, roles, view, canDraftBio, ...summary };
}

export async function GET(request: NextRequest) {
  if (!isDirectoryFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data, error } = await adminClient
    .from(PERSON_PROFILES_TABLE)
    .select(PERSON_PROFILE_COLUMNS)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not read your profile.' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ profile: null, roles: [], view: null, canDraftBio: false });
  }

  return NextResponse.json(
    await profileResponseBody(adminClient, auth.user, toPersonProfile(asRow(data)))
  );
}

export async function PATCH(request: NextRequest) {
  if (!isDirectoryFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a valid request body.' }, { status: 400 });
  }

  const parsed = parsePersonProfileInput(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { input } = parsed;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data: existing } = await adminClient
    .from(PERSON_PROFILES_TABLE)
    .select(PERSON_PROFILE_COLUMNS)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  // A first write has to carry a name, because display_name is NOT NULL and a
  // profile with no name on it is not a profile. Falling back to the account's
  // own name would be a guess written into somebody's public page.
  const displayName = input.displayName ?? (existing ? undefined : '');
  if (!existing && !input.displayName) {
    return NextResponse.json({ error: 'Add your name to get started.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.roles !== undefined) patch.roles = input.roles;
  if (input.city !== undefined) patch.city = input.city;
  if (input.country !== undefined) patch.country = input.country;
  if (input.availability !== undefined) patch.availability = input.availability;
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.links !== undefined) patch.links = input.links;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.profileType !== undefined) patch.profile_type = input.profileType;

  // A handle is suggested once, on the first save, and never regenerated. It
  // is a URL somebody may already have shared, so a later rename must not
  // quietly move their page — changing it is an explicit edit.
  if (!existing && patch.slug === undefined) {
    patch.slug = suggestSlug(String(displayName || input.displayName || ''));
  }

  const write = (body: Record<string, unknown>) =>
    existing
      ? adminClient
          .from(PERSON_PROFILES_TABLE)
          .update(body)
          .eq('user_id', auth.user.id)
          .select(PERSON_PROFILE_COLUMNS)
          .maybeSingle()
      : adminClient
          .from(PERSON_PROFILES_TABLE)
          .insert({ user_id: auth.user.id, ...body })
          .select(PERSON_PROFILE_COLUMNS)
          .maybeSingle();

  let { data, error } = await write(patch);

  // A collision on a handle WE suggested must not fail somebody's opt in.
  // There is no handle field on screen at that point — they typed a name and
  // pressed "List me" — so answering "that handle is taken" names a thing they
  // never chose and cannot change, which is a dead end on the one action this
  // feature depends on. Retry without one instead: the column is nullable, a
  // profile with no handle is a valid profile, and they can pick one after.
  if (error?.code === '23505' && slugConflictIsOurs(input, Boolean(existing))) {
    const { slug: _dropped, ...withoutSlug } = patch;
    ({ data, error } = await write(withoutSlug));
  }

  if (error) {
    // The one collision a person can actually hit and act on: a handle they
    // typed themselves.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That handle is taken. Try another.' }, { status: 409 });
    }
    // The profile-type column arrives with its own migration. Until it is in,
    // saying so beats a raw database message.
    if (error.code === '42703' && 'profile_type' in patch) {
      return NextResponse.json({ error: 'Profile types are not ready yet. Try again soon.' }, { status: 503 });
    }
    return NextResponse.json(
      { error: error.message || 'Could not save your profile.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    await profileResponseBody(adminClient, auth.user, toPersonProfile(asRow(data)))
  );
}
