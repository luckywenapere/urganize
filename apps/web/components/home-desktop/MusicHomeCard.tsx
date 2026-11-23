'use client';

import Link from 'next/link';
import { ChevronRight } from '@/components/icons/lucide';
import { useAuthStore } from '@/lib/auth-store';
import { markMusicIntroSeen, useMusicIntroSeen } from '@/lib/music-intro';
import { musicHref } from '@/lib/music-host';
import { useHost } from '@/lib/use-host';

/**
 * The way from the workspace to Urganize Music on Home (#1378, mock in the
 * 2026-11-23 chat). The first time, a card with a New tag and a line saying
 * what it is; once opened, a quiet row. Opens music.urganize.app.
 */
export function MusicHomeCard() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const seen = useMusicIntroSeen(userId);
  const host = useHost();

  return (
    <Link
      href={musicHref(host)}
      onClick={() => markMusicIntroSeen(userId)}
      className={`motion-focus mt-4 flex items-center gap-3 rounded-2xl bg-bg-surface px-3 text-left transition-colors hover:bg-content-primary/[0.04] ${
        seen ? 'min-h-[56px] border border-content-primary/[0.08] py-2.5' : 'min-h-[64px] border border-brand py-3'
      }`}
    >
      <span aria-hidden="true" className={`music-record flex flex-none items-center justify-center rounded-full ${seen ? 'h-8 w-8' : 'h-10 w-10'}`}>
        <span className="music-record-label h-[36%] w-[36%] rounded-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold text-content-primary">
          Urganize Music
          {seen ? null : (
            <span className="rounded-full bg-brand px-[7px] py-px text-[11px] font-semibold text-content-inverse">New</span>
          )}
        </span>
        {seen ? null : (
          <span className="block truncate text-[12.5px] text-content-secondary">Listen to new songs and put yours out</span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 flex-none text-content-tertiary" aria-hidden="true" />
    </Link>
  );
}
