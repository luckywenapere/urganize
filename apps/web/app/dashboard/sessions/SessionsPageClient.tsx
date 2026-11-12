'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { SessionsPane } from '@/components/shell/swipe/SessionsPane';
import { ChappiPageSkeleton } from '@/components/loading/ChappiPageSkeleton';
import { sessionsRedirectHref } from '@/lib/assistant-chats';
import { useSessionsViewStore } from '@/stores/useSessionsViewStore';

const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * Rollouts. On a computer it is no longer a page (Nov 12, 2026, #1218): each
 * rollout's chat sits in the Assistant's left column, so this address forwards
 * there, on the rollout it names (?release=) or the one that was open, or on
 * the general chat. Below lg it is still the list on the left and the open
 * rollout's chat (the phone's swipe shell draws its own Rollouts tab).
 */
export default function SessionsPageClient() {
  const router = useRouter();
  // null on the server and the first client paint, so neither the list nor
  // its chat loads on a computer that is about to leave.
  const isDesktop = useSyncExternalStore<boolean | null>(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => null
  );

  useEffect(() => {
    if (!isDesktop) return;
    router.replace(
      sessionsRedirectHref({
        search: window.location.search,
        openReleaseId: useSessionsViewStore.getState().releaseId,
      })
    );
  }, [isDesktop, router]);

  if (isDesktop !== false) return <ChappiPageSkeleton />;

  return (
    <div className="h-[calc(100dvh-8.5rem)] min-h-[28rem]">
      <SessionsPane active split />
    </div>
  );
}
