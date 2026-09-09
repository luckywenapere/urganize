'use client';

import { Trash2 } from '@/components/icons';
import { HelpTip } from '@/components/shared/HelpTip';

/**
 * The standing exit of the test path (NEXT_PUBLIC_FEATURE_TEST_RELEASE).
 *
 * Rendered through TasksPanel's `activitiesBanner` slot whenever the scoped
 * release carries the `test_release` metadata marker AND the viewer owns it
 * (WorkspaceView gates both — DELETE is owner-only, and a delete button that
 * 404s is worse than no banner). A standing banner, not a tour step, was the
 * founder's call (2026-09-01): wherever the user stops exploring, the way out
 * is right there.
 *
 * Dumb on purpose: WorkspaceView owns which release is scoped, the owner
 * gate, and the DeleteReleaseDialog this button opens. It also carries the
 * orientation copy the `?new=1` guide would have shown — that guide's
 * consumption effect is mount-once and cannot fire for the empty-state entry
 * (the user is already on /dashboard), so the banner does both jobs.
 *
 * Copy rules: short words, "you", no em dash, and never the word "workspace"
 * (banned on mascot-adjacent surfaces, and this sits one slot from them).
 */
export function TestReleaseBanner({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="mb-4 rounded-xl border border-brand/30 bg-brand/5 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
        Test rollout
      </p>
      <h3 className="mt-1 font-display text-base font-semibold text-content-primary">
        This is a test rollout
      </h3>
      {/* Four sentences until 2026-09-08, standing permanently on a banner.
          The fourth ("when you are done, delete it below") was already
          redundant with the Delete button directly underneath it. */}
      <p className="mt-1 text-sm leading-6 text-content-secondary">
        Nothing here is real. Tick activities off, open the tools, move things around.{' '}
        <HelpTip helpKey="workspace.testRelease" className="align-text-bottom" />
      </p>
      <button
        type="button"
        onClick={onDelete}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-stroke-default bg-bg-surface px-2.5 py-1.5 text-xs font-semibold text-content-secondary transition-colors hover:border-status-error/40 hover:bg-status-error/10 hover:text-status-error"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Delete test rollout
      </button>
    </div>
  );
}
