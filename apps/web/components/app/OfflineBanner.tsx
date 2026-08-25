'use client';

import { useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '@/lib/offline/status';

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
// RECONNECT_MESSAGE_MS is how long the "Back online" confirmation lingers
// after reconnecting, purely so the transition doesn't vanish before anyone
// reads it. Phase 3 (the mutation queue) extends this message to name how
// many queued changes are syncing; until then it just confirms the network
// is back.
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
  const wasOfflineRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!OFFLINE_ENABLED) return;

    const clearHideTimer = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const handleOffline = () => {
      wasOfflineRef.current = true;
      clearHideTimer();
      setShowReconnected(false);
    };

    const handleOnline = () => {
      if (!wasOfflineRef.current) return;
      wasOfflineRef.current = false;
      setShowReconnected(true);
      clearHideTimer();
      hideTimerRef.current = setTimeout(() => setShowReconnected(false), RECONNECT_MESSAGE_MS);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      clearHideTimer();
    };
  }, []);

  if (!OFFLINE_ENABLED) return null;
  if (isOnline && !showReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 border-b border-stroke-subtle bg-bg-surface px-4 py-2 text-center"
    >
      <p className="text-sm text-content-secondary">
        {isOnline ? (
          <span className="font-medium text-content-primary">Back online.</span>
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
