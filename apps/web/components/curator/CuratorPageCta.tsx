'use client';

// The one control on a curator's public page, and the whole reason the page
// exists: it turns a reader into somebody who can actually pitch her.
//
// Three readers, three answers:
//   nobody signed in  -> make an account, and remember who sent them
//   a team account    -> straight to the composer, already scoped to her
//   a curator account -> an honest line, because they cannot pitch
//
// The signed-out branch is what the SERVER renders, and that is deliberate
// rather than a default: almost everyone opening a link posted to a WhatsApp
// status has no account, so the honest first paint is the one that asks them
// to make one. `mounted` then upgrades it, which is the same hydration-safe
// shape WorkspaceIdentityPanel uses for its collapsed state.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { markPitchIntent, scopedPitchingPath } from '@/lib/pitch-intent';

type Props = {
  slug: string;
  displayName: string;
  hasPlaylists: boolean;
  /** 'row': the button on the header row of the page on a computer (#1232). */
  layout?: 'stacked' | 'row';
};

export function CuratorPageCta({ slug, displayName, hasPlaylists, layout = 'stacked' }: Props) {
  const [mounted, setMounted] = useState(false);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const role = useAuthStore((state) => state.user?.role);

  useEffect(() => setMounted(true), []);

  // A curator-only account has no rollouts and cannot pitch anybody. Saying so
  // beats a button that would bounce them off a team route.
  const isCuratorOnly = mounted && isAuthenticated && role === 'curator';
  const isTeamReader = mounted && !isAuthLoading && isAuthenticated && !isCuratorOnly;

  const button =
    'inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-medium transition-opacity hover:opacity-90';
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;

  if (layout === 'row') {
    if (isCuratorOnly) {
      return (
        <p className="max-w-[240px] text-right text-[14px]" style={{ color: 'var(--kit-text-muted)' }}>
          You are signed in as a playlist owner, so there is nothing to send from here.
        </p>
      );
    }
    return (
      <Link
        href={isTeamReader ? scopedPitchingPath(slug) : '/onboarding'}
        onClick={isTeamReader ? undefined : () => markPitchIntent(slug)}
        className={`${button} whitespace-nowrap`}
        style={{ backgroundColor: 'var(--kit-accent)', color: 'var(--kit-ground)' }}
      >
        Pitch a song to {firstName}
      </Link>
    );
  }

  if (isCuratorOnly) {
    return (
      <p className="mt-8 text-[15px]" style={{ color: 'var(--kit-text-muted)' }}>
        You are signed in as a playlist owner, so there is nothing to send from here.
      </p>
    );
  }

  if (isTeamReader) {
    return (
      <div className="mt-8">
        <Link
          href={scopedPitchingPath(slug)}
          className={button}
          style={{ backgroundColor: 'var(--kit-accent)', color: 'var(--kit-ground)' }}
        >
          Pitch to {displayName}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <Link
        href="/onboarding"
        onClick={() => markPitchIntent(slug)}
        className={button}
        style={{ backgroundColor: 'var(--kit-accent)', color: 'var(--kit-ground)' }}
      >
        Pitch your music
      </Link>
      <p className="mt-3 text-[13px]" style={{ color: 'var(--kit-text-faint)' }}>
        {/* No pricing claim here on purpose. The trial terms have moved four
            times and this page is one somebody posts once and never revisits,
            so a number written into it would go stale where nobody is looking.
            What it says instead is mechanical and cannot. */}
        {hasPlaylists
          ? `You make an account, then send your song straight to ${displayName}.`
          : `Make an account and you can send ${displayName} your song.`}
      </p>
    </div>
  );
}
