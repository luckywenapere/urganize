'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatNotificationTime, getNotificationMessage, type TaskNotification } from '@/lib/tasks';
import { TASKS_CHANGED_EVENT, useTaskUI } from '@/components/tasks/TaskUIProvider';

type NotificationsPayload = {
  notifications?: TaskNotification[];
  unreadCount?: number;
  error?: string;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

/**
 * Notifications bell, now docked inside AppTopbar (was previously a floating
 * fixed-position widget rendered from TaskUIProvider). It reads `openTask`
 * from useTaskUI() directly and refetches its feed when a TASKS_CHANGED_EVENT
 * fires — the same event the rest of the workspace uses after task patches,
 * completions, and creates. No `refreshKey` prop plumbing needed; the bell
 * is now self-sufficient.
 */
export function TaskNotificationBell() {
  const { openTask } = useTaskUI();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return;
      }

      const response = await fetch('/api/notifications', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as NotificationsPayload;
      if (!response.ok) {
        return;
      }

      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
      setUnreadCount(Number(payload.unreadCount || 0));
    } catch {
      // Notifications should never block the shell.
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  // Refetch on TASKS_CHANGED_EVENT (dispatched after task patches, creates,
  // deletes, completes, comments). Replaces the old refreshKey prop wired by
  // TaskUIProvider.
  useEffect(() => {
    const handleTasksChanged = () => {
      void loadNotifications();
    };
    window.addEventListener(TASKS_CHANGED_EVENT, handleTasksChanged);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, handleTasksChanged);
  }, [loadNotifications]);

  useEffect(() => {
    let lastFetchTime = Date.now();

    const handleFocus = () => {
      const now = Date.now();
      // Only refetch if the last fetch was more than 30 seconds ago to prevent flashing/excessive network activity
      if (now - lastFetchTime > 30000) {
        lastFetchTime = now;
        void loadNotifications();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadNotifications]);

  const markNotificationsRead = async (notificationIds?: string[]) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return;
    }

    await fetch('/api/notifications/read', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notificationIds?.length ? { notificationIds } : {}),
    });

    await loadNotifications();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="relative grid h-10 w-10 place-items-center border border-stroke-default bg-bg-elevated text-content-secondary transition-colors hover:bg-white/[0.04] hover:text-content-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        aria-label="Open notifications"
        aria-expanded={isOpen}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0v3.2c0 .83.26 1.64.74 2.31l.76 1.08H5l.76-1.08c.48-.67.74-1.48.74-2.31V9.5Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-status-error px-1.5 text-[11px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 mt-3 w-[min(92vw,380px)] overflow-hidden rounded-[26px] border border-stroke-default bg-bg-surface shadow-[0_24px_72px_-34px_rgba(0,0,0,0.72)]">
            <div className="flex items-center justify-between border-b border-stroke-subtle px-4 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Notifications</p>
                <p className="mt-1 text-sm text-content-secondary">Recent task activity and due date nudges.</p>
              </div>
              {notifications.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void markNotificationsRead()}
                  className="text-xs font-semibold uppercase tracking-[0.12em] text-content-secondary hover:text-content-primary"
                >
                  Mark all read
                </button>
              ) : null}
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-2">
              {notifications.length === 0 ? (
                <div className="rounded-[20px] px-4 py-6 text-sm text-content-secondary">
                  No notifications yet. Assigned tasks and due dates show up here.
                </div>
              ) : (
                notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => {
                      void markNotificationsRead([notification.id]);
                      openTask(notification.taskId);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-start gap-3 rounded-[20px] px-4 py-4 text-left transition ${
                      notification.read ? 'text-content-secondary hover:bg-bg-hover' : 'bg-brand-muted/45 hover:bg-brand-muted'
                    }`}
                  >
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        notification.read ? 'bg-white/15' : 'bg-status-error'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-content-primary">
                        {notification.taskTitle}
                      </span>
                      <span className="mt-1 block text-sm">{getNotificationMessage(notification)}</span>
                      <span className="mt-2 block text-xs text-content-tertiary">
                        {formatNotificationTime(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                ))
              )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
