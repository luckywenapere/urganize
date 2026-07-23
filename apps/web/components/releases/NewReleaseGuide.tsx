'use client';

import { Sparkles, X } from 'lucide-react';

type NewReleaseGuideProps = {
  onDismiss: () => void;
};

/**
 * One-time getting-started guide shown right after a release is created
 * (founder call, 2026-07-23 — replaces the modal's static helper line,
 * "Add the release basics. You can add tasks, assets, and collaborators
 * after creating.", moved here so it lands where the user actually is: on
 * the release itself). Triggered by the `?new=1` param the create flows
 * (WorkspaceView, ChappiPageClient) append to the redirect; the page reads
 * it once, shows this, then strips the param so a refresh never repeats it.
 *
 * No "assets" mention — file storage is flagged off (URG-182).
 */
export function NewReleaseGuide({ onDismiss }: NewReleaseGuideProps) {
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4"
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-content-primary">Your release is set up</p>
        <p className="mt-1 text-sm leading-6 text-content-secondary">
          The rollout plan below is a starting point — edit any task, add your own, or reassign
          them to your team. Invite teammates any time from Settings.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss guide"
        className="motion-focus grid h-7 w-7 shrink-0 place-items-center text-content-tertiary transition-colors hover:text-content-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
