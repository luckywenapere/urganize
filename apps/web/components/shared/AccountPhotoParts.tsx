'use client';

import { useState, type ReactNode } from 'react';
import { Camera } from '@/components/icons';
import { PROFILE_PHOTO_MIME_TYPES } from '@/lib/profile-photo';
import { profileInitials } from './ProfileFace';
import { PhotoCircle, useMyPhotoUrl } from './AccountPhoto';


/**
 * Pieces shared by the account photo surfaces (onboarding row, invitee step,
 * Settings). Mocks: photo-mocks-v3 (founder approved 2026-10-30).
 */

export const ACCEPTED_PHOTO_TYPES = PROFILE_PHOTO_MIME_TYPES.join(',');

/** The green camera badge on an empty face. `ring` is the page colour around it. */
export function CameraBadge({ size, ring = 'border-bg-surface', borderWidth = 2 }: { size: number; ring?: string; borderWidth?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute -bottom-0.5 -right-0.5 z-[2] grid place-items-center rounded-full bg-brand text-content-inverse ${ring}`}
      style={{ width: size, height: size, borderWidth, borderStyle: 'solid' }}
    >
      <Camera style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}

/** Flat initials, the same tile onboarding uses. */
export function InitialsCircle({
  name,
  size,
  tone = 'quiet',
  children,
}: {
  name: string;
  size: number;
  tone?: 'quiet' | 'brand';
  children?: ReactNode;
}) {
  const fontSize = size >= 100 ? 28 : size >= 64 ? 24 : 13;
  return (
    <span
      aria-hidden="true"
      className={`relative grid shrink-0 place-items-center rounded-full font-semibold ${
        tone === 'brand' ? 'bg-brand font-bold text-content-inverse' : 'bg-bg-hover text-content-secondary'
      }`}
      style={{ width: size, height: size, fontSize }}
    >
      {profileInitials(name)}
      {children}
    </span>
  );
}

/** The white-on-black veil and spinner over a photo while it uploads. */
export function UploadVeil({ large = false }: { large?: boolean }) {
  return (
    <span aria-hidden="true" className="absolute inset-0 z-[1] grid place-items-center rounded-full bg-black/45">
      <span
        className={`animate-spin rounded-full border-white/35 border-t-white motion-reduce:animate-none ${
          large ? 'h-6 w-6 border-[3px]' : 'h-4 w-4 border-2'
        }`}
      />
    </span>
  );
}

/**
 * The face for an account photo surface: the uploading preview under a veil,
 * else your saved photo, else initials with the camera badge. A photo that
 * fails to load falls back to initials.
 */
export function AccountPhotoFace({
  name,
  size,
  previewUrl,
  uploading,
  badgeSize,
  badgeRing,
  badgeBorder,
  tone,
  overrideUrl,
  overlay,
}: {
  name: string;
  size: number;
  previewUrl: string | null;
  uploading: boolean;
  badgeSize: number;
  badgeRing?: string;
  badgeBorder?: number;
  tone?: 'quiet' | 'brand';
  /** Show this instead of the saved photo (the Google suggestion). */
  overrideUrl?: string | null;
  overlay?: ReactNode;
}) {
  const saved = useMyPhotoUrl();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (uploading && previewUrl) {
    return <PhotoCircle src={previewUrl} size={size} onFail={() => undefined} overlay={<UploadVeil large={size >= 100} />} />;
  }
  const url = overrideUrl ?? saved;
  if (url && failedUrl !== url) {
    return <PhotoCircle src={url} size={size} onFail={() => setFailedUrl(url)} overlay={overlay} />;
  }
  return (
    <InitialsCircle name={name} size={size} tone={tone}>
      {uploading ? <UploadVeil large={size >= 100} /> : <CameraBadge size={badgeSize} ring={badgeRing} borderWidth={badgeBorder} />}
    </InitialsCircle>
  );
}
