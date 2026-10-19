'use client';

import { Bell } from '@/components/icons';
import { bellBadge } from '@/lib/notification-groups';
import { useSwipeNav } from '@/stores/useSwipeNavStore';
import { useNotificationsDoorStore } from '@/stores/useNotificationsDoorStore';

/**
 * Notifications on a phone (2026-10-17, founder call): a bell at the top right
 * of Home, left of the team's faces, instead of a row in the More sheet. The
 * same plain bell and unread dot as the computer's top bar (URG-255); the count
 * is spoken through aria-label. Phone only, because the computer's top bar
 * already has its bell. It owns nothing: NotificationsBell (mounted in TopNav at
 * every width) keeps the list and the panel, and this asks it to open.
 */
export function HomeBell() {
  const available = useNotificationsDoorStore((state) => state.available);
  const unread = useNotificationsDoorStore((state) => state.unread);
  const requestOpen = useNotificationsDoorStore((state) => state.requestOpen);
  // The swipe navigation has no bell (URG-380): notices are a turn in UrgAns.
  const swipe = useSwipeNav();
  if (!available || swipe) return null;
  const badge = bellBadge(unread);

  return (
    <button
      type="button"
      onClick={() => requestOpen()}
      aria-label={badge.ariaLabel}
      data-home-bell
      className="motion-focus motion-press relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-secondary hover:bg-bg-hover hover:text-content-primary lg:hidden"
    >
      <Bell className="pointer-events-none h-5 w-5" aria-hidden="true" />
      {badge.visible ? (
        <span
          aria-hidden="true"
          data-unread-dot
          className="absolute right-[11px] top-[11px] h-2 w-2 rounded-full bg-brand ring-2 ring-bg-base"
        />
      ) : null}
    </button>
  );
}
