'use client';

import Link from 'next/link';
import { ArrowRight, X } from '@/components/icons/lucide';
import type { MusicGuidance } from '@/lib/music/rules';
import { teamHref } from '@/lib/music-host';
import { useHost } from '@/lib/use-host';

const COPY: Record<Exclude<MusicGuidance, null>, { title: string; body: string }> = {
  team: {
    title: 'Your rollouts moved',
    body: 'They are under Settings, Artist dashboard. Or use the Dashboard button.',
  },
  curator: {
    title: 'Your pitches moved',
    body: 'Songs sent to your playlists are under Settings, Playlist pitches.',
  },
  both: {
    title: 'Your rollouts and pitches moved',
    body: 'Rollouts are under Settings, Artist dashboard. Pitches are under Settings, Playlist pitches.',
  },
};

/**
 * The card an existing Urganize user sees on their first visits to the song
 * list, now that signing in lands here instead of on their rollouts or pitches.
 * It says where those went and links straight to them. It stays until they open
 * it or close it, and never comes back once closed.
 */
export function GuidanceCard({
  kind,
  onDismiss,
}: {
  kind: Exclude<MusicGuidance, null>;
  onDismiss: () => void;
}) {
  const copy = COPY[kind];
  const host = useHost();
  return (
    <section
      aria-label={copy.title}
      className="mb-4 rounded-xl border border-brand/50 bg-brand/10 p-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-content-primary">{copy.title}</h2>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close this"
          className="motion-focus -mr-1.5 -mt-1.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-full text-content-secondary hover:bg-bg-hover"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-0.5 text-xs text-content-secondary">{copy.body}</p>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
        {kind !== 'curator' ? (
          <Link
            href={teamHref(host, '/dashboard')}
            onClick={onDismiss}
            className="motion-focus inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-brand"
          >
            Open my rollouts <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        {kind !== 'team' ? (
          <Link
            href={teamHref(host, '/curator')}
            onClick={onDismiss}
            className="motion-focus inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-brand"
          >
            Open my pitches <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
