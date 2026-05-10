'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatNotificationTime, getNotificationMessage, type TaskNotification } from '@/lib/tasks';

type TaskNotificationBellProps = {
  onOpenTask: (taskId: string) => void;
  refreshKey?: number;
};

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

export function TaskNotificationBell({ onOpenTask, refreshKey = 0 }: TaskNotificationBellProps) {
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
  }, [loadNotifications, refreshKey]);

  useEffect(() => {
    const handleFocus = () => {
      void loadNotifications();
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
    <div className="pointer-events-auto fixed right-4 top-[4.75rem] z-[150] md:right-6">
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="relative grid h-12 w-12 place-items-center rounded-full border border-stroke-default bg-bg-sidebar/95 text-content-primary shadow-[0_18px_42px_-28px_rgba(0,0,0,0.45)] backdrop-blur-sm"
          aria-label="Open notifications"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
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
                      onOpenTask(notification.taskId);
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
    </div>
  );
}
