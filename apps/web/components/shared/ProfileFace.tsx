'use client';

// A face for anyone the product shows: curators in pitching, artists on the
// roster, people in the directory. Started as the curator face (pitching) and
// was lifted here on 2026-10-11 when artists and directory people got photos.
//
// Pitching is a person-to-person moment (an artist hoping a real human hears
// their song), so the product leads with faces rather than rows of names
// (founder brief, 2026-10-11). A curator with no photo still gets a flat
// initials tile (never a gradient).

import { useState } from 'react';
import { THUMB_EDGE_PX } from '@/lib/image-thumb';
import { shouldShowPhoto } from '@/lib/profile-face';
import { ThumbImage } from './ThumbImage';

export const profileInitials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';

type ProfileFaceProps = {
  name: string;
  photoUrl?: string | null;
  /** 'fill' covers its (relative) parent, for tiles; a number is a round avatar of that many px. */
  size?: 'fill' | number;
  className?: string;
  /** Rounded square instead of a circle, for a header or a tile. */
  square?: boolean;
};

export function ProfileFace({ name, photoUrl, size = 'fill', className = '', square = false }: ProfileFaceProps) {
  const fill = size === 'fill';
  // A photo that fails to load (an expired signed link, a deleted file) falls
  // back to the initials tile. Keyed by url so a fresh link gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const box = fill
    ? 'absolute inset-0 h-full w-full'
    : `relative inline-flex shrink-0 overflow-hidden ${square ? 'rounded-2xl' : 'rounded-full'}`;
  const style = fill ? undefined : { width: size, height: size };

  if (photoUrl && shouldShowPhoto(photoUrl, failedUrl)) {
    // The server hands over the 384px copy when there is one
    // (lib/image-thumb.ts). The surface-colour box holds the slot until the
    // photo is fully decoded, then ThumbImage fades it in: never half painted.
    const edge = fill ? THUMB_EDGE_PX : (size as number);
    return (
      <span className={`${box} bg-bg-surface ${className}`} style={style}>
        <ThumbImage src={photoUrl} width={edge} height={edge} className="block h-full w-full object-cover" onError={() => setFailedUrl(photoUrl)} />
      </span>
    );
  }

  const px = fill ? 0 : (size as number);
  const textSize = fill
    ? 'text-4xl sm:text-5xl'
    : px >= 80 ? 'text-2xl' : px >= 48 ? 'text-base' : px >= 36 ? 'text-xs' : px >= 28 ? 'text-[11px]' : px >= 20 ? 'text-[9px]' : 'text-[7px]';
  return (
    <span
      aria-hidden="true"
      className={`${box} items-center justify-center font-display font-semibold text-content-secondary bg-bg-elevated ${fill ? 'flex' : ''} ${textSize} ${className}`}
      style={style}
    >
      {profileInitials(name)}
    </span>
  );
}
