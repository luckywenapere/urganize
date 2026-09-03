'use client';

import { create } from 'zustand';

import type { IssueKind } from '@/lib/issue-reports';

/**
 * The report dialog's launcher, and nothing else.
 *
 * It opens from two places in different ownership islands — the `?` HelpMenu in
 * the topbar and a section in Settings → Account — so the dialog is mounted once
 * in AppShell and opened through this store rather than threading a callback
 * down to each entry point (the usePlannerStore reasoning, verbatim).
 *
 * The form's own state stays in the dialog. This holds the launcher and the
 * kind it should open on, which is all a caller needs to say.
 */
type ReportIssueState = {
  isOpen: boolean;
  /** Which tab the dialog opens on. Both entry points open on 'bug' today. */
  kind: IssueKind;
  openReportIssue: (kind?: IssueKind) => void;
  closeReportIssue: () => void;
};

export const useReportIssueStore = create<ReportIssueState>((set) => ({
  isOpen: false,
  kind: 'bug',
  openReportIssue: (kind = 'bug') => set({ isOpen: true, kind }),
  closeReportIssue: () => set({ isOpen: false }),
}));
