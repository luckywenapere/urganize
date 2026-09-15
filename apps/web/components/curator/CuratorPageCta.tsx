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
};

export function CuratorPageCta({ slug, displayName, hasPlaylists }: Props) {
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
          ? 'You make an account, then send your song straight to her.'
          : 'Make an account and you can send her your song.'}
      </p>
    </div>
  );
}
