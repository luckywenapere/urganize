import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-constants';
import {
  CURATOR_PHOTO_SIGNED_URL_TTL_SECONDS,
  CURATOR_PROFILES_TABLE,
  CURATOR_PROFILE_COLUMNS,
  curatorPhotoPathPrefix,
  flagOffResponse,
  isPitchingFeatureEnabled,
  parseBio,
  parseDisplayName,
  requireCuratorUser,
} from '../_shared';
import type { CuratorProfile } from '@/types/pitching';

// The curator's own profile. Display name and bio are what a pitcher sees when
// browsing playlists, so this is the one place a curator presents themselves.

async function buildProfile(
  adminClient: SupabaseClient,
  row: Record<string, unknown>
): Promise<CuratorProfile> {
  const photoPath = typeof row.photo_path === 'string' && row.photo_path ? row.photo_path : null;
  let photoUrl: string | null = null;
  if (photoPath) {
    // Signed on every read and never stored: the URL expires, so a cached one
    // would start returning 403 mid-session.
    const { data } = await adminClient.storage
      .from(RELEASE_ASSETS_BUCKET)
      .createSignedUrl(photoPath, CURATOR_PHOTO_SIGNED_URL_TTL_SECONDS);
    photoUrl = data?.signedUrl || null;
  }
  return {
    displayName: typeof row.display_name === 'string' ? row.display_name : '',
    bio: typeof row.bio === 'string' ? row.bio : '',
    photoUrl,
    photoPath,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

export async function GET(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  const { data, error } = await auth.adminClient
    .from(CURATOR_PROFILES_TABLE)
    .select(CURATOR_PROFILE_COLUMNS)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not load your profile.' },
      { status: 500 }
    );
  }
  if (!data) {
    // requireCuratorUser passed, so profiles.role is 'curator' but the
    // curator_profiles row is missing. That means the join route half-finished.
    return NextResponse.json({ error: 'Your profile is not set up yet.' }, { status: 404 });
  }

  return NextResponse.json({
    profile: await buildProfile(auth.adminClient, data as Record<string, unknown>),
  });
}

export async function PATCH(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const auth = await requireCuratorUser(request);
  if ('error' in auth) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const updates: Record<string, unknown> = {};

  if ('displayName' in payload) {
    const parsed = parseDisplayName(payload.displayName);
    if ('error' in parsed) return parsed.error;
    updates.display_name = parsed.value;
  }

  if ('bio' in payload) {
    const parsed = parseBio(payload.bio);
    if ('error' in parsed) return parsed.error;
    updates.bio = parsed.value;
  }

  // photoPath: a string points at a freshly uploaded object, null clears the
  // photo, absent leaves it alone.
  if ('photoPath' in payload) {
    if (payload.photoPath === null) {
      updates.photo_path = null;
    } else if (typeof payload.photoPath === 'string' && payload.photoPath) {
      // The path must live under this curator's own prefix. Without this check
      // a curator could point their profile at any object in the bucket,
      // including another team's release art.
      if (!payload.photoPath.startsWith(curatorPhotoPathPrefix(auth.user.id))) {
        return NextResponse.json({ error: 'That photo is not yours.' }, { status: 400 });
      }
      updates.photo_path = payload.photoPath;
    } else {
      return NextResponse.json({ error: 'Photo path must be text.' }, { status: 400 });
    }
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  const { data, error } = await auth.adminClient
    .from(CURATOR_PROFILES_TABLE)
    .update(updates)
    .eq('user_id', auth.user.id)
    .select(CURATOR_PROFILE_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not save your profile.' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Your profile is not set up yet.' }, { status: 404 });
  }

  // Keep the account name in step with the display name so both sides of the
  // product call this person the same thing.
  if (typeof updates.display_name === 'string') {
    await auth.adminClient
      .from('profiles')
      .update({ name: updates.display_name })
      .eq('id', auth.user.id);
  }

  return NextResponse.json({
    profile: await buildProfile(auth.adminClient, data as Record<string, unknown>),
  });
}
