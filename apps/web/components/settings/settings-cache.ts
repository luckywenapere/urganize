import type { WorkspaceMember } from '@/types/auth';
import type { WorkspaceArtist } from './WorkspaceArtistSection';

// Cache-first (founder call, 2026-07-23): entering Settings must SHOW
// settings, not loaders. The last-known workspace artist and teammates list
// are persisted per user; a fresh visit renders them instantly while the
// fetches refresh silently in the background. Same pattern as
// useReleaseStore's command-center cache.
//
// Shared by useWorkspaceSettings and useTeammates (split out of
// SettingsPageClient 2026-08-13) so both halves keep one version number — a
// per-hook copy could be bumped on one side only, and the type guards would
// then accept a shape the other side no longer writes.
export const ARTIST_CACHE_KEY = 'urganize.settings.workspace-artist';
export const TEAMMATES_CACHE_KEY = 'urganize.settings.teammates';
export const SETTINGS_CACHE_VERSION = 1;

// Held the single artist until rosters shipped (2026-08-30). The key and the
// version are unchanged on purpose: the guard below now requires an `artists`
// ARRAY, so an entry written by an older build fails validation and is treated
// as no cache at all. That is exactly the outcome a version bump would buy, and
// it keeps one number shared with the teammates cache — which this file's own
// header warns must not be bumped on one side only.
export type ArtistCache = { userId: string; artists: WorkspaceArtist[] };
export type TeammatesCache = { userId: string; members: WorkspaceMember[] };

export const isArtistCache = (value: unknown): value is ArtistCache =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>).userId === 'string' &&
  Array.isArray((value as Record<string, unknown>).artists);

export const isTeammatesCache = (value: unknown): value is TeammatesCache =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>).userId === 'string' &&
  Array.isArray((value as Record<string, unknown>).members);
