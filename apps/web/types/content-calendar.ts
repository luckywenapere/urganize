export const SOCIAL_PLATFORM_OPTIONS = [
  'tiktok',
  'instagram',
  'youtube',
  'x',
  'facebook',
  'snapchat',
  'whatsapp',
  'threads',
  'other',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORM_OPTIONS)[number];

export const CONTENT_POST_STATUS_OPTIONS = ['draft', 'ready', 'posted'] as const;

export type ContentPostStatus = (typeof CONTENT_POST_STATUS_OPTIONS)[number];

export const CONTENT_POST_FORMAT_OPTIONS = ['video', 'image', 'carousel', 'text', 'other'] as const;

export type ContentPostFormat = (typeof CONTENT_POST_FORMAT_OPTIONS)[number];

export const CONTENT_POST_PILLAR_OPTIONS = [
  'behind_the_scenes',
  'performance',
  'promo',
  'fan_engagement',
  'announcement',
  'other',
] as const;

export type ContentPostPillar = (typeof CONTENT_POST_PILLAR_OPTIONS)[number];

export interface ContentCalendar {
  id: string;
  releaseId: string;
  platform: SocialPlatform;
  /** Free-text label disambiguating multiple calendars on one platform
   * ("Main account", "Experiment B"). May be empty. */
  name: string;
  /** Number of posts on this calendar. Computed by the list endpoint via one
   * grouped count query; 0 on payloads that don't carry counts (create,
   * ensure-in-release lookups). */
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPost {
  id: string;
  calendarId: string;
  releaseId: string;
  /** Sharing group for sibling rows across calendars. Null = unique post.
   * Dormant until Phase B: Phase A rejects every sharing param, so this is
   * always null on rows created today. */
  sharedGroupId: string | null;
  /** YYYY-MM-DD, date-only (matching the release-date convention). */
  scheduledDate: string;
  title: string;
  caption: string;
  format: ContentPostFormat;
  status: ContentPostStatus;
  pillar: ContentPostPillar | null;
  /** Optional link to the live post; only meaningful once status is posted. */
  postedUrl: string | null;
  /** Optional link to an existing release asset. Column exists from Phase A;
   * the picker UI is Phase B. */
  assetId: string | null;
  /** How many sibling rows share this post's sharedGroupId (self included).
   * 1 for unique posts. Computed by the list endpoint via one grouped query. */
  sharedCount: number;
  createdAt: string;
  updatedAt: string;
}
