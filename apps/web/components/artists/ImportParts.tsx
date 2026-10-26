'use client';

import { useState } from 'react';
import type { ImportRelease } from '@/lib/artist-import/providers';

export function formatFans(value: number | null): string {
  if (value === null) return '';
  if (value >= 1_000_000) return `${(Math.round(value / 100_000) / 10).toString()}M fans`;
  if (value >= 1000) return `${(Math.round(value / 100) / 10).toString()}K fans`;
  return `${value} fans`;
}

export function kindLabel(kind: ImportRelease['kind']): string {
  return kind === 'ep' ? 'EP' : kind === 'album' ? 'Album' : 'Single';
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

/** A remote cover, or a flat letter tile when there is none or it fails to load. */
export function Cover({ release }: { release: Pick<ImportRelease, 'coverUrl' | 'title'> }) {
  const [failed, setFailed] = useState(false);
  if (release.coverUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote covers, never optimised or stored
      <img
        src={release.coverUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="aspect-square w-full rounded-lg bg-bg-surface object-cover"
      />
    );
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-bg-surface text-lg font-semibold text-content-secondary">
      {release.title.charAt(0).toUpperCase()}
    </div>
  );
}
