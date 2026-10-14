'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, X } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { useNotificationsDoorStore } from '@/stores/useNotificationsDoorStore';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { useToast } from '@/components/shared/ToastProvider';
import { getNotificationMessage, type TaskNotification } from '@/lib/tasks';
import { formatRelativeTime } from '@/lib/relative-time';
import {
  bellBadge,
  type DigestNotificationType,
  describeDigestTitles,
  getDigestMessage,
  groupNotifications,
} from '@/lib/notification-groups';
import {
  TOAST_BURST_WINDOW_MS,
  describeToastBurst,
  isTierToastCoolingDown,
} from '@/lib/notification-toast-burst';

// Phase 1 of in-app notifications: the front door for an already-built
// backend (notifications table + GET /api/notifications +
// PATCH /api/notifications/read). No new events written here, no schema
// change — just the bell + dropdown the rest of the app has been missing.
// Gated behind the workspace flag so it ships alongside the rest of the
// workspace UI overhaul and can be reverted via env without a code change.
const WORKSPACE_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

type NotificationsResponse = {
  notifications?: TaskNotification[];
  unreadCount?: number;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

/**
 * One notification as a row. Used for ordinary notifications and for the rows
 * inside an opened digest; `nested` indents it under its digest line.
 */
function NotificationRow({
  notification,
  nested = false,
  onSelect,
}: {
  notification: TaskNotification;
  nested?: boolean;
  onSelect: (notification: TaskNotification) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(notification)}
      className={`motion-focus flex w-full items-start gap-3 py-3 pr-3 text-left transition-colors hover:bg-bg-hover ${
        nested ? 'pl-8' : 'pl-3'
      } ${notification.read ? '' : 'bg-brand/5'}`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          notification.read ? 'bg-transparent' : 'bg-brand'
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-content-primary">{getNotificationMessage(notification)}</p>
        <p className="mt-0.5 truncate text-xs text-content-secondary">{notification.taskTitle}</p>
        <p className="mt-1 text-[11px] text-content-tertiary">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
    </button>
  );
}

/**
 * Topbar notifications bell. Matches WorkspaceMenu's interaction model:
 *   - Outside mousedown closes
 *   - Esc closes and returns focus to the trigger
 *   - Trigger is a 40×40 square consistent with the workspace-menu trigger
 *
 * Read-marking model (Phase 2): opening the dropdown is a non-destructive
 * PEEK — the badge does not change. Clicking a row is one action: it marks
 * THAT notification read (PATCH /api/notifications/read with notificationIds
 * = [id]) and navigates to the related task. "Mark all read" stays as the
 * manual blanket clear.
 *
 * Cross-context open bridge: the bell sits inside AppShell → TaskUIProvider
 * (see AppShell.tsx:72), so `useTaskUI()` is reachable here without a portal
 * or a global ref. `openTask(taskId)` is route-agnostic — the drawer is
 * rendered at AppShell level and overlays whatever page is mounted. To put
 * the user in the correct release context underneath, we route through
 * Next's router to `/dashboard?release={taskReleaseId}` first; the workspace
 * picks up the URL scope via useReleaseScope on the next render. The drawer
 * is opened immediately after — TaskUIProvider's openTask already handles
 * "task not in the local store" by falling back to a fetch (the inline note
 * at TaskUIProvider.tsx:282-284 calls this exact path out).
 */
export function NotificationsBell() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.id || '');
  const { openTask } = useTaskUI();
  const { pushToast } = useToast();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  // Which digests are opened. Keyed by the digest id, which stays the same
  // while the run's newest row does, so a refetch does not shut one.
  const [openDigests, setOpenDigests] = useState<ReadonlySet<string>>(() => new Set());

  // Derived rather than stored — the server's unreadCount is just
  // `notifications.filter(n => !n.read).length` over the same payload it
  // returns, so deriving it client-side eliminates a redundant state slot
  // and a class of "they drift" bugs. Both flips through markRead and any
  // future per-row toggles update one source.
  const unreadCount = notifications.reduce(
    (count, notification) => (notification.read ? count : count + 1),
    0
  );

  // The daily due-date sweep writes one row per task, all within seconds, so a
  // run of them is shown as one line (see lib/notification-groups.ts).
  const entries = useMemo(() => groupNotifications(notifications), [notifications]);

  const toggleDigest = useCallback((id: string) => {
    setOpenDigests((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Returns the freshly-fetched list so callers that need the row that just
  // arrived via realtime can look it up by id without waiting for the next
  // render of `notifications` state. The state still updates as a side effect.
  const fetchNotifications = useCallback(async (options?: {
    /** Realtime-driven refreshes pass true: the list already renders and the
     * user didn't ask for anything, so don't flip the loading state. */
    background?: boolean;
  }): Promise<TaskNotification[]> => {
    if (!options?.background) {
      setIsLoading(true);
    }
    try {
      const token = await getAccessToken();
      if (!token) return [];
      const response = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) return [];
      const data = (await response.json().catch(() => ({}))) as NotificationsResponse;
      // unreadCount in the payload is ignored — it's derived from the same
      // list below. See the inline note above the `unreadCount` line.
      const list = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(list);
      setHasFetched(true);
      return list;
    } catch {
      // Best-effort: badge keeps its last known value, dropdown shows what we have.
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch when the user is signed in — the badge needs to show even
  // before the user opens the dropdown.
  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchNotifications();
  }, [isAuthenticated, fetchNotifications]);

  // Realtime subscription: toast + refetch the moment a row is INSERTed for
  // this user. Fail-open contract — if the publication isn't enabled, the
  // websocket can't connect, or the JWT expires mid-session, the channel
  // silently no-ops. The bell still surfaces the new row the next time the
  // user opens the dropdown via fetchNotifications. See the migration at
  // supabase/migrations/20260604_notifications_realtime_publication.sql for
  // the one-line ALTER that needs to be applied in Supabase for this to
  // start broadcasting.
  //
  // RLS already restricts SELECTs (and therefore realtime broadcasts) to
  // `user_id = auth.uid()`. The `user_id=eq.${userId}` filter is defense in
  // depth — also lets Supabase short-circuit on the broker side instead of
  // sending us rows we'd just drop client-side.
  //
  // Self-action exclusion: the row-write sites (createTaskNotification's
  // comment-route caller, and any future task_assigned / task_status_changed
  // sites) already guard with `assignee !== actor`. The defensive check
  // below catches a row whose actor_id equals this user — e.g. if a future
  // call site forgot to filter. Notifications with no actor (task_due_soon /
  // task_overdue from the scheduled createDueDateNotificationsForAllUsers
  // sweep) still toast.
  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    // The due-date sweep inserts one row per task, so rows arrive in bursts.
    // Collect the ids that land inside one short window, refresh the list ONCE,
    // and show one toast that says what the burst was (lib/notification-toast-
    // burst). A repeat of the same sweep tier shortly after stays quiet.
    const pendingIds: string[] = [];
    let burstTimer: ReturnType<typeof setTimeout> | null = null;
    const lastTierToastAt = new Map<DigestNotificationType, number>();

    const flushBurst = async () => {
      burstTimer = null;
      const ids = pendingIds.splice(0, pendingIds.length);
      if (ids.length === 0) return;
      // background: the user didn't ask for a load, so no loading-state flip.
      // The list is capped at NOTIFICATION_LIST_LIMIT rows and the realtime payload carries no
      // title, so this one refetch is also what hydrates the toast.
      const list = await fetchNotifications({ background: true });
      const burst = describeToastBurst(ids, list);
      const now = Date.now();
      if (isTierToastCoolingDown(lastTierToastAt, burst.tier, now)) return;
      if (burst.tier) lastTierToastAt.set(burst.tier, now);
      pushToast(burst.message);
    };

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newRow = payload.new as
            | { id?: string; actor_id?: string | null }
            | null;
          if (!newRow?.id) return;
          if (newRow.actor_id && newRow.actor_id === userId) return;
          pendingIds.push(newRow.id);
          if (burstTimer === null) {
            burstTimer = setTimeout(() => void flushBurst(), TOAST_BURST_WINDOW_MS);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // A task getting deleted cascade-deletes its notifications too
          // (notifications.task_id is ON DELETE CASCADE) — drop the row
          // from local state immediately rather than leaving a stale entry
          // visible until the next manual refetch. Requires REPLICA IDENTITY
          // FULL on this table (see the migration alongside this change) —
          // without it, `old` would only carry the primary key, which is
          // enough to filter local state by id but not by user_id, so the
          // subscription's filter itself wouldn't match at all.
          const deletedRow = payload.old as { id?: string } | null;
          if (!deletedRow?.id) return;
          setNotifications((prev) => prev.filter((n) => n.id !== deletedRow.id));
        }
      )
      .subscribe();

    return () => {
      if (burstTimer !== null) clearTimeout(burstTimer);
      // removeChannel returns a promise but we don't await — teardown is
      // fire-and-forget; the channel will be GC'd by the supabase client.
      void supabase.removeChannel(channel);
    };
  }, [isAuthenticated, userId, fetchNotifications, pushToast]);

  // Outside-click close (mousedown, matching WorkspaceMenu — fires before the
  // target's click so the menu closes cleanly when the user clicks elsewhere).
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Closing on purpose (Esc, or the phone's Close button) hands focus back to
  // the bell. Below lg the bell is hidden (the panel opens from More), so a
  // focus() on it lands nowhere; there the bottom bar's More button stands in,
  // since that is the door the person came through.
  const closeAndReturnFocus = useCallback(() => {
    setIsOpen(false);
    requestAnimationFrame(() => {
      const trigger = triggerRef.current;
      trigger?.focus();
      if (trigger && document.activeElement === trigger) return;
      document.querySelector<HTMLElement>('[data-shell-more]')?.focus();
    });
  }, []);

  // Esc close — stopPropagation so this beats any page-level Esc handlers
  // (create-release modal, drawers) when the bell is the active surface.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeAndReturnFocus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeAndReturnFocus]);

  // The phone's door (2026-10-11): the button below is desktop only, so the
  // bottom bar's More sheet shows the unread count and asks the panel to open
  // through this store. Reported here so More never offers a door to a bell
  // that is switched off.
  const reportDoor = useNotificationsDoorStore((state) => state.report);
  const openRequest = useNotificationsDoorStore((state) => state.openRequest);
  const doorAvailable = WORKSPACE_FEATURE_ENABLED && isAuthenticated;
  useEffect(() => {
    reportDoor({ available: doorAvailable, unread: unreadCount });
  }, [reportDoor, doorAvailable, unreadCount]);
  useEffect(() => () => reportDoor({ available: false, unread: 0 }), [reportDoor]);
  const lastOpenRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest === lastOpenRequest.current) return;
    lastOpenRequest.current = openRequest;
    setIsOpen(true);
    void fetchNotifications();
  }, [openRequest, fetchNotifications]);

  // Mark a specific set of notifications read (or all when `ids === 'all'`).
  // Empty body → server marks every unread row for this user; with ids →
  // restricted to that subset. See app/api/notifications/read/route.ts:33-36.
  // Optimistic local update: a momentarily-wrong "everything's read" badge
  // is a smaller surprise than the badge re-appearing after the user thought
  // they'd cleared it. On failure, reconcile immediately (don't wait for the
  // next dropdown open) and tell the user, rather than silently leaving them
  // believing it worked when the server never persisted it.
  const markRead = useCallback(async (ids: string[] | 'all') => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.read) return n;
        if (ids === 'all' || ids.includes(n.id)) {
          return { ...n, read: true };
        }
        return n;
      })
    );

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not signed in.');
      const response = await fetch('/api/notifications/read', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ids === 'all' ? {} : { notificationIds: ids }),
      });
      if (!response.ok) throw new Error('Server rejected the request.');
    } catch {
      pushToast('Could not mark as read. Please try again.', 'error');
      void fetchNotifications();
    }
  }, [fetchNotifications, pushToast]);

  // Clear ALL notifications (founder call, 2026-07-23) — optimistic empty
  // with the same failure contract as markRead: on error, reconcile from
  // the server and tell the user.
  const clearAll = useCallback(async () => {
    setNotifications([]);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not signed in.');
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Server rejected the request.');
    } catch {
      pushToast('Could not clear notifications. Please try again.', 'error');
      void fetchNotifications();
    }
  }, [fetchNotifications, pushToast]);

  const handleToggle = () => {
    setIsOpen((open) => {
      const next = !open;
      if (next) {
        // Peek-on-open: refresh the list so a long-lived tab doesn't show
        // stale data, but do NOT auto-mark-read. The badge stays accurate
        // until the user explicitly acts (click a row, or "Mark all read").
        void fetchNotifications();
      }
      return next;
    });
  };

  const handleSelect = useCallback(
    (notification: TaskNotification) => {
      // Read + navigate is one action — see the doc block at the top of the
      // component. Order: optimistic mark-read + server PATCH (fire-and-
      // forget), close the dropdown, switch route scope so the workspace
      // shows the right release underneath, then openTask so the drawer
      // surfaces over it. openTask is route-agnostic so racing the route
      // change against the drawer mount is safe.
      if (!notification.read) {
        void markRead([notification.id]);
      }
      setIsOpen(false);

      const targetHref = notification.taskReleaseId
        ? `/dashboard?release=${notification.taskReleaseId}`
        : '/dashboard';

      // Only navigate when we're not already at exactly the right URL —
      // avoids a redundant history push when the user clicks a notification
      // for the release they're currently scoped to. usePathname()'s search
      // is intentionally separate, so we eyeball both halves.
      const currentScope =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('release') || null
          : null;
      const sameRoute = pathname === '/dashboard';
      const sameScope = currentScope === (notification.taskReleaseId || null);
      if (!sameRoute || !sameScope) {
        router.push(targetHref);
      }

      openTask(notification.taskId);
    },
    [markRead, openTask, pathname, router]
  );

  if (!WORKSPACE_FEATURE_ENABLED) return null;
  if (!isAuthenticated) return null;

  // The badge and the button's spoken name come from one function so they
  // cannot disagree: "9+" on screen is "more than 9 unread" aloud, never an
  // exact number the screen does not show. The list is capped at
  // NOTIFICATION_LIST_LIMIT rows by the API, so a count past the cap is "at least".
  const badge = bellBadge(unreadCount);
  const hasUnread = unreadCount > 0;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={badge.ariaLabel}
        className="motion-focus motion-press relative hidden h-10 w-10 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary lg:grid"
      >
        {/* A plain outline bell (URG-255, 2026-10-14: the "live" signal mark
            read as one more thing to decode). Unread is a small dot, not a
            number; the count is still spoken through aria-label. */}
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {badge.visible ? (
          <span
            aria-hidden="true"
            data-unread-dot
            className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand ring-2 ring-bg-base"
          />
        ) : null}
      </button>

      {isOpen ? (
        <div
          ref={menuRef}
          id={panelId}
          // A group, not a role="menu": these rows are buttons reached with
          // Tab, and a menu promises arrow-key movement they never had.
          role="group"
          aria-label="Notifications"
          // Below `sm` the panel pins to the viewport (inset-x-4, 1rem under
          // the safe area: the phone has no top bar row since 2026-10-11, so
          // the 4rem it used to clear is gone) instead of anchoring to the
          // trigger — a 360px panel
          // anchored right-0 to a bell that sits ~3.5rem in from the edge
          // runs off the left side of a phone screen. Nothing above it may
          // become a containing block for `fixed` (a transform, filter or
          // backdrop-filter on an ancestor): until 2026-10-11 AppShell's
          // lazy-fade transform did, so opening this from More after
          // scrolling put it at the top of the PAGE, off screen
          // (lib/fixed-containing-block-guard.test.ts). From `sm` up it reverts to the WorkspaceMenu-style
          // trigger-anchored dropdown.
          className="animate-menu-down fixed inset-x-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] z-50 origin-top-right rounded-xl border border-stroke-default bg-bg-surface shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px] sm:max-w-[calc(100vw-2rem)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-stroke-subtle min-h-12 px-3 py-1 sm:min-h-0 sm:py-3">
            {/* No Beta pill here (founder call, 2026-07-23). The Settings row
                carried one until 2026-08-16, when every Beta stamp in the app
                was dropped; this panel never had one either way. */}
            <p className="text-sm font-semibold text-content-primary">Notifications</p>
            <div className="flex items-center gap-3">
              {hasUnread ? (
                <button
                  type="button"
                  onClick={() => void markRead('all')}
                  className="motion-focus min-h-10 px-1 text-xs text-content-secondary transition-colors hover:text-content-primary sm:min-h-0 sm:px-0"
                >
                  Mark all read
                </button>
              ) : null}
              {notifications.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void clearAll()}
                  className="motion-focus min-h-10 px-1 text-xs text-content-secondary transition-colors hover:text-content-primary sm:min-h-0 sm:px-0"
                >
                  Clear
                </button>
              ) : null}
              {/* Phones only: the panel covers the width of the screen there,
                  so outside taps are a small target. Same button as the
                  house sheets' close (the Filters sheet in ListToolbar). */}
              <button
                type="button"
                onClick={closeAndReturnFocus}
                aria-label="Close"
                className="motion-focus grid h-11 w-11 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover lg:hidden"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {isLoading && !hasFetched ? (
              <p className="px-3 py-8 text-center text-xs text-content-secondary">
                Loading notifications…
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-content-secondary">
                No notifications yet.
              </p>
            ) : (
              <ul className="divide-y divide-stroke-subtle">
                {entries.map((entry) => {
                  if (entry.kind === 'single') {
                    return (
                      <li key={entry.notification.id}>
                        <NotificationRow
                          notification={entry.notification}
                          onSelect={handleSelect}
                        />
                      </li>
                    );
                  }

                  const isDigestOpen = openDigests.has(entry.id);
                  const listId = `${panelId}-${entry.id}`;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => toggleDigest(entry.id)}
                        aria-expanded={isDigestOpen}
                        aria-controls={isDigestOpen ? listId : undefined}
                        className={`motion-focus flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-bg-hover ${
                          entry.unreadCount > 0 ? 'bg-brand/5' : ''
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            entry.unreadCount > 0 ? 'bg-brand' : 'bg-transparent'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-content-primary">
                            {getDigestMessage(entry.type, entry.notifications.length)}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-content-secondary">
                            {describeDigestTitles(entry.notifications.map((n) => n.taskTitle))}
                          </p>
                          <p className="mt-1 text-[11px] text-content-tertiary">
                            {formatRelativeTime(entry.newestAt)}
                          </p>
                        </div>
                        <ChevronDown
                          aria-hidden="true"
                          className={`mt-1 h-4 w-4 shrink-0 text-content-tertiary transition-transform ${
                            isDigestOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isDigestOpen ? (
                        <ul
                          id={listId}
                          className="divide-y divide-stroke-subtle border-t border-stroke-subtle"
                        >
                          {entry.notifications.map((notification) => (
                            <li key={notification.id}>
                              <NotificationRow
                                notification={notification}
                                nested
                                onSelect={handleSelect}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
