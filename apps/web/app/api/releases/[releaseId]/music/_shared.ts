import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export {
  createAdminClient,
  requireActiveAuthenticatedUser,
} from '@/app/api/_shared/auth';

// The shared, team-aware release access pair: members read and write, guests are
// read-only, a non-member gets the same 404 a missing rollout does.
// lib/release-access-guard.test.ts freezes this convention.
export {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';

export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminClient = SupabaseClient;

export const badRequest = (error: string): NextResponse =>
  NextResponse.json({ error }, { status: 400 });

export const notFound = (error = 'Song not found.'): NextResponse =>
  NextResponse.json({ error }, { status: 404 });

export { isOwnMusicPath, musicFolder } from '@/lib/music/rules';
