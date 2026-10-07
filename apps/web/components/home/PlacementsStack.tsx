'use client';

import { HOME_BLOCK_LABELS } from '@/lib/home/sections';
import type { PlacementItem } from '@/lib/home/stack-items';
import { HomeStack } from './HomeStack';

/**
 * Pitches as one stack: playlists that added a song first, then the ones still
 * under review. Pitches only; distribution and money are not on Home.
 */
export function PlacementsStack({ items }: { items: readonly PlacementItem[] }) {
  return (
    <HomeStack
      label={HOME_BLOCK_LABELS.placements}
      items={items}
      getKey={(item) => item.key}
      renderItem={({ pitch, placed }) => (
        <div className="flex items-start gap-3">
          <span
            className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${placed ? 'bg-brand' : 'bg-status-info'}`}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-content-primary">{pitch.playlistName}</p>
            <p className="mt-0.5 break-words text-xs text-content-tertiary">
              {placed ? 'Added your song' : 'Under review'}
              {' · '}
              {pitch.songTitle}
              {pitch.curatorName ? ` · ${pitch.curatorName}` : ''}
              {' · '}
              {pitch.sentDaysAgo === 0 ? 'Sent today' : `Sent ${pitch.sentDaysAgo}d ago`}
            </p>
          </div>
        </div>
      )}
    />
  );
}
