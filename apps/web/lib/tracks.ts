import { sanitizeTextField } from '@/lib/pre-save';

export const TRACK_STORAGE_BUCKET = 'release-audio';
export const TRACK_SIGNED_URL_TTL_SECONDS = 60 * 15;

export const TRACK_STATUS_VALUES = ['processing', 'ready', 'error'] as const;
export type TrackStatus = (typeof TRACK_STATUS_VALUES)[number];

export const SHARE_LINK_STATUS_VALUES = ['active', 'expired', 'revoked'] as const;
export type ShareLinkStatus = (typeof SHARE_LINK_STATUS_VALUES)[number];

export type TrackWaveformData = number[];

export interface Track {
  id: string;
  releaseId: string | null;
  userId: string;
  title: string;
  fileUrl: string;
  fileSize: number;
  durationSeconds: number | null;
  mimeType: string;
  waveformData: TrackWaveformData | null;
  status: TrackStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
  previewUrl: string | null;
}

export interface ShareLink {
  id: string;
  trackId: string;
  userId: string;
  token: string;
  label: string | null;
  expiresAt: string | null;
  playCount: number;
  isRevoked: boolean;
  createdAt: string;
  status: ShareLinkStatus;
  shareUrl: string;
}

export interface ListenPageData {
  track: {
    id: string;
    title: string;
    artistName: string;
    releaseTitle: string | null;
    durationSeconds: number | null;
    waveformData: TrackWaveformData | null;
    audioUrl: string;
    artworkUrl: string | null;
    mimeType: string;
  };
  shareLink: {
    id: string;
    label: string | null;
    expiresAt: string | null;
    playCount: number;
  };
}

export type TrackApiError = {
  error: string;
  details?: string;
  sql?: string;
  retryAfterSeconds?: number;
};

export type TrackListResponse = {
  tracks: Track[];
};

export type TrackResponse = {
  track: Track;
};

export type TrackUploadResponse = {
  trackId: string;
  track: Track;
};

export type ShareLinkListResponse = {
  shareLinks: ShareLink[];
};

export type ShareLinkResponse = {
  shareLink: ShareLink;
};

export type ListenPageResponse = {
  data: ListenPageData;
};

export type UpdateTrackBody = {
  title?: unknown;
  position?: unknown;
};

export type CreateShareLinkBody = {
  label?: unknown;
  expiresAt?: unknown;
};

export const ALLOWED_AUDIO_EXTENSIONS = ['mp3', 'wav', 'aiff', 'flac'] as const;
export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/aiff',
  'audio/x-aiff',
  'audio/flac',
  'audio/x-flac',
] as const;

export function isTrackStatus(value: unknown): value is TrackStatus {
  return TRACK_STATUS_VALUES.includes(String(value || '').trim() as TrackStatus);
}

export function sanitizeTrackTitle(value: unknown): string {
  return sanitizeTextField(String(value || ''), 160);
}

export function sanitizeShareLinkLabel(value: unknown): string | null {
  const normalized = sanitizeTextField(String(value || ''), 160);
  return normalized || null;
}

export function getAudioFileExtension(fileName: string): string {
  return String(fileName || '')
    .split('.')
    .pop()
    ?.trim()
    .toLowerCase() || '';
}

export function isAllowedAudioFile(fileName: string, mimeType: string): boolean {
  const extension = getAudioFileExtension(fileName);
  if (ALLOWED_AUDIO_EXTENSIONS.includes(extension as (typeof ALLOWED_AUDIO_EXTENSIONS)[number])) {
    return true;
  }

  return ALLOWED_AUDIO_MIME_TYPES.includes(
    String(mimeType || '').trim().toLowerCase() as (typeof ALLOWED_AUDIO_MIME_TYPES)[number]
  );
}

export function parseTrackPosition(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Math.round(parsed);
  if (normalized < 1) {
    return null;
  }

  return normalized;
}

export function parseDurationSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed);
}

export function sanitizeWaveformData(value: unknown): TrackWaveformData | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.max(0, Math.min(1, entry)))
    .slice(0, 160);

  return normalized.length > 0 ? normalized : null;
}

export function parseTrackWaveformPayload(value: unknown): TrackWaveformData | null {
  if (typeof value === 'string') {
    try {
      return sanitizeWaveformData(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return sanitizeWaveformData(value);
}

export function parseShareLinkExpiry(value: unknown): { value: string | null; error?: string } {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return { value: null };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { value: null, error: 'Expiry date must use YYYY-MM-DD format.' };
  }

  const parsedDate = new Date(`${normalized}T23:59:59.999Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return { value: null, error: 'Expiry date is invalid.' };
  }

  return { value: parsedDate.toISOString() };
}

export function buildListenPath(token: string): string {
  return `/listen/${String(token || '').trim()}`;
}

export function buildAbsoluteListenUrl(token: string, origin?: string): string {
  const configuredOrigin =
    origin?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
    'http://localhost:3000';

  const baseUrl = configuredOrigin.startsWith('http')
    ? configuredOrigin
    : `https://${configuredOrigin}`;

  return new URL(buildListenPath(token), baseUrl).toString();
}

export function getShareLinkStatus(input: {
  expiresAt: string | null;
  isRevoked: boolean;
}): ShareLinkStatus {
  if (input.isRevoked) {
    return 'revoked';
  }

  if (input.expiresAt) {
    const expiresAt = new Date(input.expiresAt).getTime();
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      return 'expired';
    }
  }

  return 'active';
}

export function formatTrackDuration(seconds: number | null): string {
  if (!Number.isFinite(seconds) || (seconds || 0) < 0) {
    return '0:00';
  }

  const totalSeconds = Math.round(seconds || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatTrackFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
