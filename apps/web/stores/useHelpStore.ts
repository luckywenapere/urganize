'use client';

import { create } from 'zustand';

/**
 * The Help dialog's launcher (self-serve checkout, 2026-10-22). Mounted once in
 * AppShell; opened from the account menu's help rows and the phone's More
 * sheet, which live in different ownership islands (the useReportIssueStore
 * reasoning).
 */
type HelpState = {
  isOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
};

export const useHelpStore = create<HelpState>((set) => ({
  isOpen: false,
  openHelp: () => set({ isOpen: true }),
  closeHelp: () => set({ isOpen: false }),
}));
