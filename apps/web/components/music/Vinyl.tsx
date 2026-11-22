/* eslint-disable @next/next/no-img-element */
'use client';

import { musicInitials } from '@/lib/music/rules';
import type { PublicTrack } from '@/lib/music/server';

type RecordTrack = Pick<PublicTrack, 'title' | 'coverUrl'>;

/**
 * A song as a vinyl record (#1364, docs/mocks/music-v2): grooves, the cover as
 * the label (or flat initials when there is no cover, never a gradient), and a
 * spindle hole. It turns only while its song plays, and the reduced-motion
 * setting stops it (globals.css, .music-spin).
 */
export function Vinyl({
  track,
  spinning = false,
  className = 'h-11 w-11',
  showInitials = true,
  grooves = 6,
}: {
  track: RecordTrack;
  spinning?: boolean;
  className?: string;
  /** Small records in a list read better without letters on the label. */
  showInitials?: boolean;
  grooves?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={`music-record relative block flex-none rounded-full ${spinning ? 'music-spin' : ''} ${className}`}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {Array.from({ length: grooves }, (_, i) => (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={47 - i * (16 / Math.max(1, grooves - 1))}
            fill="none"
            stroke={`rgba(245,240,230,${i % 3 ? 0.06 : 0.12})`}
            strokeWidth="0.6"
          />
        ))}
      </svg>
      <span className="music-record-label absolute inset-[31%] overflow-hidden rounded-full [container-type:inline-size]">
        {track.coverUrl ? (
          <img src={track.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : showInitials ? (
          <span className="flex h-full w-full items-end justify-center pb-[14%] text-[clamp(8px,24cqw,40px)] font-bold tracking-tight text-[#f5f0e6]">
            {musicInitials(track.title)}
          </span>
        ) : null}
      </span>
      <span className="absolute left-1/2 top-1/2 h-[5%] min-h-[3px] w-[5%] min-w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f5f0e6]" />
    </span>
  );
}

/** The record sleeve: the cover, or a flat green square with the initials. */
export function Sleeve({ track, className = '' }: { track: RecordTrack; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`music-record-label relative z-[2] flex flex-none items-end overflow-hidden rounded-md p-3 text-[#f5f0e6] shadow-[0_8px_20px_rgba(26,22,17,0.18)] ${className}`}
    >
      {track.coverUrl ? (
        <img src={track.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="text-[28px] font-bold leading-none tracking-[-0.04em] lg:text-[44px]">{musicInitials(track.title)}</span>
      )}
    </span>
  );
}
