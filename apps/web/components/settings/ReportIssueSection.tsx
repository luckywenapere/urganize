'use client';

import { useReportIssueStore } from '@/stores/useReportIssueStore';
import { panelClass } from './panelClass';
import { InfoTip } from '@/components/shared/HelpTip';

const REPORT_ISSUE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_REPORT_ISSUE === 'true';

/**
 * "Something not right?" — the second entry point to the report dialog, and
 * the one that makes it reachable at all on a phone.
 *
 * The other entry point is the `?` HelpMenu in the topbar, which is
 * `hidden md:block`. Without this section a phone would have no way to report a
 * bug, which is the gap this whole feature exists to close — mobile is where
 * most of these users are, and it is also where the app is hardest to use when
 * something breaks. Settings is reachable there through the "You" tab in the
 * bottom bar.
 *
 * It opens the same single dialog instance AppShell mounts, through the shared
 * store, so the two entry points cannot drift into two different forms.
 */
export function ReportIssueSection() {
  const openReportIssue = useReportIssueStore((state) => state.openReportIssue);

  if (!REPORT_ISSUE_ENABLED) return null;

  return (
    <section className={panelClass}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary flex items-center gap-2">
        Report an issue
        <InfoTip label="Report an issue" text="Something broken, or something you wish Urganize did? Tell us here and it goes straight to the people building it." />
      </h2>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openReportIssue('bug')}
          className="rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-semibold text-content-primary hover:border-brand"
        >
          Report a bug
        </button>
        <button
          type="button"
          onClick={() => openReportIssue('request')}
          className="rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-semibold text-content-primary hover:border-brand"
        >
          Make a request
        </button>
      </div>
    </section>
  );
}
