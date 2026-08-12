import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import {
  CONTENT_POST_FORMAT_OPTIONS,
  CONTENT_POST_PILLAR_OPTIONS,
  CONTENT_POST_STATUS_OPTIONS,
  SOCIAL_PLATFORM_OPTIONS,
  type ContentCalendar,
  type ContentPost,
  type ContentPostFormat,
  type ContentPostPillar,
  type ContentPostStatus,
  type SocialPlatform,
} from '@/types/content-calendar';

// Shared helpers for the content-calendar route group (URG-157, Phase A):
// table constants, the feature flag check, row mappers, input validation, and
// the calendar-in-release tenancy check. No schema-missing fallback here on
// purpose: environments are assumed migrated (CLAUDE.md "Patterns being
// deprecated in v1"); a missing table surfaces as a normal 500.

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here so
// the content-calendar route import sites stay stable (the releases/_shared.ts
// convention).
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  createAdminClient,
} from '@/app/api/_shared/auth';

export const CONTENT_CALENDARS_TABLE = 'content_calendars';
export const CONTENT_POSTS_TABLE = 'content_posts';

export const MAX_NAME_LENGTH = 80;
export const MAX_TITLE_LENGTH = 120;
export const MAX_CAPTION_LENGTH = 2000;

// Feature flag: the whole content calendar surface stays dark until
// NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR is 'true'. Every handler checks this
// first and 404s when off, so direct API calls cannot reach the feature
// either (the EPK / plan route precedent).
export const isContentCalendarFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';

export function isValidPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORM_OPTIONS as readonly string[]).includes(value);
}

// The calendar name is an optional free-text label ("Main account",
// "Experiment B"); absent means empty, mirroring the column default.
export function validateCalendarName(value: unknown): { value: string; error?: string } {
  if (value === undefined || value === null) {
    return { value: '' };
  }

  if (typeof value !== 'string') {
    return { value: '', error: 'Calendar name must be a string.' };
  }

  const trimmed = value.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { value: '', error: `Calendar name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }

  return { value: trimmed };
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Strict YYYY-MM-DD with a real calendar date behind it: the T00:00:00 parse
// rejects rollovers like 2026-02-30, which come back as Invalid Date.
export function isValidScheduledDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

export function isValidPostFormat(value: unknown): value is ContentPostFormat {
  return typeof value === 'string' && (CONTENT_POST_FORMAT_OPTIONS as readonly string[]).includes(value);
}

export function isValidPostStatus(value: unknown): value is ContentPostStatus {
  return typeof value === 'string' && (CONTENT_POST_STATUS_OPTIONS as readonly string[]).includes(value);
}

export function isValidPostPillar(value: unknown): value is ContentPostPillar {
  return typeof value === 'string' && (CONTENT_POST_PILLAR_OPTIONS as readonly string[]).includes(value);
}

// The post title is the grid-chip label: required, short.
export function validatePostTitle(value: unknown): { value: string; error?: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { value: '', error: 'Title is required.' };
  }

  const trimmed = value.trim();
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return { value: '', error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.` };
  }

  return { value: trimmed };
}

// The caption is optional long text; absent or null means empty, mirroring
// the column default. Deliberately not trimmed: caption whitespace and
// newlines are the author's formatting.
export function validatePostCaption(value: unknown): { value: string; error?: string } {
  if (value === undefined || value === null) {
    return { value: '' };
  }

  if (typeof value !== 'string') {
    return { value: '', error: 'Caption must be a string.' };
  }

  if (value.length > MAX_CAPTION_LENGTH) {
    return { value: '', error: `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer.` };
  }

  return { value };
}

export const toContentCalendar = (row: Record<string, unknown>, postCount = 0): ContentCalendar => ({
  id: String(row.id || ''),
  releaseId: String(row.release_id || ''),
  platform: (String(row.platform || 'other') as SocialPlatform) || 'other',
  name: String(row.name || ''),
  postCount,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

export const toContentPost = (row: Record<string, unknown>, sharedCount = 1): ContentPost => ({
  id: String(row.id || ''),
  calendarId: String(row.calendar_id || ''),
  releaseId: String(row.release_id || ''),
  sharedGroupId: row.shared_group_id ? String(row.shared_group_id) : null,
  scheduledDate: String(row.scheduled_date || ''),
  title: String(row.title || ''),
  caption: String(row.caption || ''),
  format: (String(row.format || 'video') as ContentPostFormat) || 'video',
  status: (String(row.status || 'draft') as ContentPostStatus) || 'draft',
  pillar: row.pillar ? (String(row.pillar) as ContentPostPillar) : null,
  postedUrl: row.posted_url ? String(row.posted_url) : null,
  assetId: row.asset_id ? String(row.asset_id) : null,
  sharedCount,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

// THE tenancy boundary for every route that receives a calendarId (post
// routes AND calendar PATCH/DELETE): the admin client bypasses RLS, and
// ensureReleaseOwnership only covers the URL's releaseId, so the calendar
// must additionally be proven to belong to that release. 404 (never 403) so
// probing cannot distinguish "exists on another release" from "does not
// exist". The returned calendar carries postCount 0; only the list endpoint
// computes real counts.
export async function ensureCalendarInRelease(
  adminClient: ReturnType<typeof createAdminClient>,
  calendarId: string,
  releaseId: string
) {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const { data: calendar, error } = await adminClient
    .from(CONTENT_CALENDARS_TABLE)
    .select('id,release_id,platform,name,created_at,updated_at')
    .eq('id', calendarId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message || 'Could not load calendar.' }, { status: 500 }) };
  }

  if (!calendar || String(calendar.release_id || '') !== releaseId) {
    return { error: NextResponse.json({ error: 'Calendar not found.' }, { status: 404 }) };
  }

  return { calendar: toContentCalendar(calendar as Record<string, unknown>) };
}

export interface ContentCalendarReleaseSummary {
  id: string;
  ownerUserId: string;
  releaseDate: string | null;
}

// Local ownership check for this route group. Deliberately NOT the
// ensureReleaseOwnership in app/api/releases/_shared.ts: that module carries
// the deprecated schema-missing fallback helpers this feature must stay away
// from (the guard test), and its summary omits release_date, which the posts
// routes need for month resolution. Same contract otherwise: 404 (never 403)
// when the release is missing or owned by someone else.
export async function ensureReleaseOwnership(
  adminClient: ReturnType<typeof createAdminClient>,
  releaseId: string,
  userId: string
): Promise<{ error: NextResponse } | { release: ContentCalendarReleaseSummary }> {
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const { data: release, error } = await adminClient
    .from('releases')
    .select('id,owner_user_id,release_date')
    .eq('id', releaseId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message || 'Could not load release.' }, { status: 500 }) };
  }

  if (!release || String(release.owner_user_id || '') !== userId) {
    return { error: NextResponse.json({ error: 'Release not found.' }, { status: 404 }) };
  }

  return {
    release: {
      id: String(release.id || ''),
      ownerUserId: String(release.owner_user_id || ''),
      releaseDate: release.release_date ? String(release.release_date) : null,
    },
  };
}

// Sibling counts for the "On N calendars" stamp: ONE grouped-in-code query
// for however many posts are being mapped (hardening item 14; supabase-js has
// no group by, so fetch the column and reduce). Phase A short-circuits: no
// shared groups exist yet, so this returns an empty map without touching the
// database.
export async function loadSharedGroupCounts(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  sharedGroupIds: Array<string | null>
): Promise<{ error: NextResponse } | { counts: Map<string, number> }> {
  const counts = new Map<string, number>();
  const uniqueIds = [...new Set(sharedGroupIds.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0) {
    return { counts };
  }

  const { data, error } = await adminClient
    .from(CONTENT_POSTS_TABLE)
    .select('shared_group_id')
    .in('shared_group_id', uniqueIds);

  if (error) {
    return { error: NextResponse.json({ error: error.message || 'Could not load shared post counts.' }, { status: 500 }) };
  }

  for (const row of (data || []) as Array<{ shared_group_id: string | null }>) {
    if (!row.shared_group_id) continue;
    counts.set(row.shared_group_id, (counts.get(row.shared_group_id) || 0) + 1);
  }

  return { counts };
}
