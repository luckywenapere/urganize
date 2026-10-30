'use client';

import { useState } from 'react';

/**
 * A person's face on the Team tab: their photo, or a flat initials tile (no
 * gradient placeholders), with a green dot while they are online.
 */
export function TeamAvatar({
  initials,
  avatarUrl,
  online,
  size = 'md',
  pending = false,
}: {
  initials: string;
  avatarUrl: string | null;
  online: boolean;
  size?: 'sm' | 'md' | 'lg';
  pending?: boolean;
}) {
  const box = size === 'lg' ? 'h-[52px] w-[52px] text-[17px]' : size === 'md' ? 'h-11 w-11 text-[15px]' : 'h-9 w-9 text-xs';
  const dot = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  // A photo that fails to load (an expired signed link) falls back to the
  // initials. Keyed by url so a fresh link gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = Boolean(avatarUrl) && !pending && failedUrl !== avatarUrl;
  return (
    <span className={`relative inline-grid shrink-0 place-items-center rounded-full font-semibold ${box} ${
      pending ? 'border-[1.5px] border-dashed border-stroke-control text-content-tertiary' : 'bg-bg-hover text-content-primary'
    }`}>
      {showPhoto && avatarUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl}
            alt=""
            className="h-full w-full rounded-full object-cover"
            onError={() => setFailedUrl(avatarUrl)}
          />
          {/* A 1px hairline so a pale photo keeps its edge on cream. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgb(var(--color-stroke)/0.14)]" />
        </>
      ) : (
        <span aria-hidden="true">{initials || '?'}</span>
      )}
      {online ? (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-bg-surface bg-status-success ${dot}`}
          aria-label="Online now"
        />
      ) : null}
    </span>
  );
}
