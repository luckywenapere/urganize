export const STREAMING_PLATFORMS = [
  { key: 'spotify', label: 'Spotify' },
  { key: 'apple', label: 'Apple Music' },
  { key: 'youtube', label: 'YouTube Music' },
  { key: 'audiomack', label: 'Audiomack' },
  { key: 'boomplay', label: 'Boomplay' },
  { key: 'soundcloud', label: 'SoundCloud' },
] as const;

export type StreamingPlatformKey = (typeof STREAMING_PLATFORMS)[number]['key'];

export type PreSaveStreamingLinks = Partial<Record<StreamingPlatformKey, string>>;

export interface PreSaveCampaign {
  id: string;
  slug: string;
  artistName: string;
  releaseId: string | null;
  releaseTitle: string;
  releaseDate: string | null;
  coverArtUrl: string | null;
  streamingLinks: PreSaveStreamingLinks;
  createdAt: string;
  subscriberCount: number;
}

export interface PublicPreSaveCampaign extends Omit<PreSaveCampaign, 'subscriberCount'> {}

export interface PreSaveReleaseOption {
  id: string;
  artistName: string;
  title: string;
  releaseDate: string | null;
  coverArtUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreSaveSubscriber {
  id: string;
  campaignId: string;
  email: string;
  subscribedAt: string;
}

export type CreatePreSaveCampaignBody = {
  artistName?: string;
  releaseId?: string;
  streamingLinks?: Record<string, unknown> | null;
};

export type SubscribePreSaveBody = {
  email?: string;
};

export type PreSaveApiError = {
  error: string;
  details?: string;
  sql?: string;
  retryAfterSeconds?: number;
};

export type PreSaveCampaignListResponse = {
  campaigns: PreSaveCampaign[];
};

export type CreatePreSaveCampaignResponse = {
  campaign: PreSaveCampaign;
};

export type PublicPreSaveCampaignResponse = {
  campaign: PublicPreSaveCampaign;
};

export type SubscribePreSaveResponse = {
  ok: true;
  streamingLinks: PreSaveStreamingLinks;
};

export type ReleaseSelectorListResponse = {
  releases: PreSaveReleaseOption[];
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function sanitizeTextField(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeStreamingLinks(value: unknown): PreSaveStreamingLinks {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const record = value as Record<string, unknown>;
  const normalized: PreSaveStreamingLinks = {};

  for (const platform of STREAMING_PLATFORMS) {
    const rawValue = record[platform.key];
    if (typeof rawValue !== 'string') {
      continue;
    }

    const trimmedValue = rawValue.trim();
    if (!trimmedValue || !isValidHttpUrl(trimmedValue)) {
      continue;
    }

    normalized[platform.key] = trimmedValue;
  }

  return normalized;
}

export function slugifySegment(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.slice(0, 48);
}

export function buildCampaignSlugBase(artistName: string, releaseTitle: string): string {
  const slug = [slugifySegment(artistName), slugifySegment(releaseTitle)].filter(Boolean).join('-');
  return slug.slice(0, 56) || 'release';
}

export function buildPreSavePath(slug: string): string {
  return `/p/${slug}`;
}

export function buildAbsolutePreSaveUrl(slug: string, origin?: string): string {
  const configuredOrigin =
    origin?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
    'http://localhost:3000';

  const baseUrl = configuredOrigin.startsWith('http') ? configuredOrigin : `https://${configuredOrigin}`;
  return new URL(buildPreSavePath(slug), baseUrl).toString();
}

export function formatReleaseDate(value: string | null): string {
  if (!value) {
    return 'Date TBA';
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Date TBA';
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function escapeCsvValue(value: string): string {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}
