'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from '@/components/icons';
import { DIRECTORY_ROLE_LABELS } from '@/lib/directory-roles';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import type { RoleGap } from '@/lib/role-gaps';
import { captureAnalyticsEvent } from '@/lib/analytics/client';

/**
 * The jobs on this release that nobody is on yet.
 *
 * The rollout plan already knows what a release needs, so the plan writes the
 * job posts and nobody has to describe what they are looking for. This is the
 * retention mechanic the whole directory hangs off, and — since the mobile tab
 * bar is full — it is also how a phone reaches the directory at all.
 *
 * OFFERED, NOT FORCED. No modal, no email, no repeat nagging, and it never
 * blocks release work. It renders nothing unless there is genuinely something
 * to say, which is the PostPlanKitPrompt rule verbatim.
 *
 * DISMISSAL IS PER RELEASE. Each release is a new hiring moment, so silencing
 * this one must not silence the next.
 */

const STORAGE_KEY = 'urganize.directory.gaps-dismissed';
const STORAGE_VERSION = 1;
const MAX_ROWS = 4;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

export function RoleGapsPanel({ releaseId, gaps }: { releaseId: string; gaps: RoleGap[] }) {
  const [dismissed, setDismissed] = useState(true);

  // Read in an effect rather than during render: localStorage is not available
  // on the server, and a render-time read is the hydration mismatch this repo
  // has had to correct before. Starts dismissed so nothing flashes in and out.
  useEffect(() => {
    const stored = readPersistedState<string[]>(STORAGE_KEY, STORAGE_VERSION, isStringList) ?? [];
    setDismissed(stored.includes(releaseId));
  }, [releaseId]);

  // Reported once per release, and only while it is genuinely on screen. The
  // component mounts dismissed on purpose (see the effect above), so firing on
  // mount would count a panel nobody ever saw.
  const reportedRef = useRef('');
  useEffect(() => {
    if (dismissed || gaps.length === 0) return;
    if (reportedRef.current === releaseId) return;
    reportedRef.current = releaseId;
    captureAnalyticsEvent({
      name: 'role_gaps_shown',
      properties: { release_id: releaseId, gaps: gaps.length },
    });
  }, [dismissed, gaps.length, releaseId]);

  if (dismissed || gaps.length === 0) return null;

  const dismiss = () => {
    setDismissed(true);
    captureAnalyticsEvent({
      name: 'role_gaps_dismissed',
      properties: { release_id: releaseId, gaps: gaps.length },
    });
    try {
      const stored = readPersistedState<string[]>(STORAGE_KEY, STORAGE_VERSION, isStringList) ?? [];
      if (!stored.includes(releaseId)) {
        // Capped, so a long-lived account cannot grow this without bound.
        writePersistedState(STORAGE_KEY, STORAGE_VERSION, [...stored, releaseId].slice(-50));
      }
    } catch {
      // A dismissal that could not be remembered still closes the panel for
      // this session. Losing the record costs one reappearance, which is a
      // better failure than a panel that will not go away.
    }
  };

  const shown = gaps.slice(0, MAX_ROWS);

  return (
    <section className="rounded-xl border border-stroke-default p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-content-primary">
            {shown.length === 1 ? 'One job has nobody on it' : `${gaps.length} jobs have nobody on them`}
          </h3>
          <p className="mt-1 text-sm text-content-secondary">
            Your plan needs these. Find somebody who has delivered the work before.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide this for this release"
          className="motion-focus -mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {shown.map((gap) => (
          <li key={gap.role}>
            {/* Pre-filtered to the role and to people taking work. NOT to a
                city: nothing in the schema knows where this team is, and
                guessing one would apply an invented location to somebody
                else's search.

                `from` is what lets the demand this created be told apart from
                demand somebody typed, which is the whole question of whether
                this panel works. */}
            <Link
              href={`/dashboard/directory?role=${gap.role}&availability=open&from=role_gaps`}
              onClick={() =>
                captureAnalyticsEvent({
                  name: 'role_gaps_role_clicked',
                  properties: { release_id: releaseId, role: gap.role },
                })
              }
              className="motion-focus flex items-center justify-between gap-3 rounded-lg border border-stroke-subtle px-3 py-2 hover:border-brand"
            >
              <span className="min-w-0">
                <span className="block text-sm text-content-primary">
                  {DIRECTORY_ROLE_LABELS[gap.role]}
                </span>
                <span className="block truncate text-xs text-content-tertiary">
                  {gap.taskTitle}
                </span>
              </span>
              <span className="shrink-0 text-xs text-brand">Find one</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
