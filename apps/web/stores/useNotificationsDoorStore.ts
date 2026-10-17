'use client';

import { create } from 'zustand';

/**
 * The phone's way into notifications (2026-10-11). The founder took the bell
 * ("live") out of the phone's top bar. Since 2026-10-17 the phone's door is a
 * bell at the top right of Home (HomeBell; it was a row in the More sheet).
 * The real bell stays mounted and still owns the list, the realtime toasts and
 * the panel; this store only lets the phone see whether the bell is on and how
 * many are unread, and ask it to open.
 */
type NotificationsDoorState = {
  /** The bell is mounted and switched on for this person. */
  available: boolean;
  unread: number;
  /** Bumped by Home's phone bell; the real bell opens its panel when it changes. */
  openRequest: number;
  report: (input: { available: boolean; unread: number }) => void;
  requestOpen: () => void;
};

export const useNotificationsDoorStore = create<NotificationsDoorState>((set) => ({
  available: false,
  unread: 0,
  openRequest: 0,
  report: ({ available, unread }) => set({ available, unread }),
  requestOpen: () => set((state) => ({ openRequest: state.openRequest + 1 })),
}));
