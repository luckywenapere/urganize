'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { musicGuidance, type MusicGuidance } from '@/lib/music/rules';

const DISMISSED_PREFIX = 'urganize.music.guidance.';

/**
 * What the music side needs to know about whoever is looking at it, signed in
 * or not. Everything defaults to the signed-out, no-team answer, so the page is
 * correct for a stranger before auth has even answered.
 */
export function useMusicAccount() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);
  const logout = useAuthStore((state) => state.logout);

  const userId = user?.id ?? null;
  const [dismissed, setDismissed] = useState(true);

  // Read in an effect, never during render: the server has no storage, and a
  // card that flashed in and out on every load would be worse than none. It
  // starts "dismissed" so a returning person who closed it never sees it.
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    try {
      setDismissed(window.localStorage.getItem(`${DISMISSED_PREFIX}${userId}`) === '1');
    } catch {
      setDismissed(false);
    }
  }, [isAuthenticated, userId]);

  const dismissGuidance = useCallback(() => {
    setDismissed(true);
    if (!userId) return;
    try {
      window.localStorage.setItem(`${DISMISSED_PREFIX}${userId}`, '1');
    } catch {
      // Closing it for this visit is still honoured; it may come back next time.
    }
  }, [userId]);

  const role = user?.role ?? null;
  const curatorOnly = String(role || '').trim().toLowerCase() === 'curator';
  const guidance: MusicGuidance = musicGuidance({
    isAuthenticated,
    role,
    hasCuratorProfile,
    dismissed,
  });

  return {
    isAuthenticated,
    isLoading,
    /** Has a team to run (everyone but a playlist owner with no team). */
    hasTeam: isAuthenticated && !curatorOnly,
    /** Owns playlists, with or without a team as well. */
    hasPlaylists: isAuthenticated && (hasCuratorProfile === true || curatorOnly),
    guidance,
    dismissGuidance,
    logout,
  };
}
