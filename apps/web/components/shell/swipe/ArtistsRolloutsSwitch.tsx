import Link from 'next/link';
import { ARTISTS_ROLLOUTS_SEGMENTS, type ArtistsRolloutsKey } from '@/lib/artists-rollouts-switch';

/**
 * Artists / Rollouts, a segmented two-way switch (44px targets, token colours).
 * `swipeOnly` hides it unless the swipe shell is up (CSS, .swipe-switch), so the
 * Rollouts page can carry it without changing the classic shell.
 */
export function ArtistsRolloutsSwitch({ current, swipeOnly = false }: { current: ArtistsRolloutsKey; swipeOnly?: boolean }) {
  return (
    <nav
      aria-label="Artists or rollouts"
      className={`${swipeOnly ? 'swipe-switch ' : ''}mt-3 flex rounded-full bg-content-primary/[0.06] p-1`}
    >
      {ARTISTS_ROLLOUTS_SEGMENTS.map((segment) => {
        const active = segment.key === current;
        return (
          <Link
            key={segment.key}
            href={segment.href}
            aria-current={active ? 'page' : undefined}
            className={`motion-focus flex h-11 flex-1 items-center justify-center rounded-full text-[15px] font-semibold ${
              active ? 'bg-bg-base text-content-primary' : 'text-content-primary/55 hover:text-content-primary'
            }`}
          >
            {segment.label}
          </Link>
        );
      })}
    </nav>
  );
}
