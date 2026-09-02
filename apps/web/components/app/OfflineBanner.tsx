'use client';

import { useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '@/lib/offline/status';
import { supabase } from '@/lib/supabase/client';
import { pendingCount, subscribeQueueChanges } from '@/lib/offline/queue';

// The offline indicator. A slim full-width strip above the topbar — the
// TeamTrialStrip contract verbatim: calm, states the fact, offers no action
// to click, and is NOT dismissible (dismissing it would hide the one thing
// that stops "why did my activity disappear" from being a surprise; it is
// one line, covers nothing, and clears itself the moment the connection
// returns).
//
// Renders nothing when the offline flag is off — the whole point of the
// flag is that nothing about the app's behavior changes until it's on, and
// a banner claiming "you can keep working" while nothing actually queues
// yet would be a lie.
//
// The reconnect message names how many queued changes are syncing, and
// updates as they actually leave the queue (via subscribeQueueChanges) —
// not a one-off count frozen at the instant the connection came back, which
// would drift from reality the moment the first item synced. Once the
// count reaches zero it collapses to a plain "Back online." for
// RECONNECT_MESSAGE_MS before disappearing.
//
// The reconnect transition is tracked via the raw window online/offline
// events, not a reactive effect over useOnlineStatus()'s current value —
// setState belongs in the EVENT CALLBACK, not the effect body, or React
// flags a cascading synchronous render (react-hooks/set-state-in-effect).
const OFFLINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_OFFLINE === 'true';
const RECONNECT_MESSAGE_MS = 4000;

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [syncingCount, setSyncingCount] = useState(0);
  const wasOfflineRef = useRef(false);
  // Mirrors showReconnected but readable from inside the queue-subscription
  // closure below without it going stale: that closure is created once, on
  // mount, and a plain read of the `showReconnected` STATE variable there
  // would always see its initial value rather than the current one. A ref
  // is exactly the "read current external state from a callback" case the
  // set-state-in-effect rule's own guidance points at.
  const showingReconnectRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!OFFLINE_ENABLED) return;

    const clearHideTimer = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const refreshSyncingCount = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      const count = await pendingCount(userId);
      setSyncingCount(count);
      if (count === 0) {
        clearHideTimer();
        hideTimerRef.current = setTimeout(() => {
          showingReconnectRef.current = false;
          setShowReconnected(false);
        }, RECONNECT_MESSAGE_MS);
      }
    };

    const handleOffline = () => {
      wasOfflineRef.current = true;
      showingReconnectRef.current = false;
      clearHideTimer();
      setShowReconnected(false);
    };

    const handleOnline = () => {
      if (!wasOfflineRef.current) return;
      wasOfflineRef.current = false;
      showingReconnectRef.current = true;
      setShowReconnected(true);
      clearHideTimer();
      void refreshSyncingCount();
    };

    // The queue changes as AppShell's flush (lib/offline/sync.ts) works
    // through it — this is what lets the count count DOWN in place rather
    // than freezing at whatever it was the instant the connection returned.
    const unsubscribeQueue = subscribeQueueChanges(() => {
      if (showingReconnectRef.current) {
        void refreshSyncingCount();
      }
    });

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      unsubscribeQueue();
      clearHideTimer();
    };
  }, []);

  if (!OFFLINE_ENABLED) return null;
  if (isOnline && !showReconnected) return null;

  const reconnectMessage =
    syncingCount > 0
      ? `Back online — syncing ${syncingCount} ${syncingCount === 1 ? 'change' : 'changes'}…`
      : 'Back online.';

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 border-b border-stroke-subtle bg-bg-surface px-4 py-2 text-center"
    >
      <p className="text-sm text-content-secondary">
        {isOnline ? (
          <span className="font-medium text-content-primary">{reconnectMessage}</span>
        ) : (
          <>
            <span className="font-medium text-content-primary">You&rsquo;re offline.</span>{' '}
            You can keep working — changes will sync when you&rsquo;re back online.
          </>
        )}
      </p>
    </div>
  );
}
