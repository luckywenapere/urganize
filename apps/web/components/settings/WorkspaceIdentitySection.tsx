'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { panelClass } from './panelClass';
import { feedbackErrorClass, feedbackSuccessClass } from './feedback';
import { saveButtonVisible } from '@/lib/settings-dirty';

type WorkspaceIdentitySectionProps = {
  input: string;
  onInputChange: (value: string) => void;
  isLoading: boolean;
  isSaving: boolean;
  /** True once the input differs from the saved name. Owned by the parent, since
   *  the saved name lives in the identity store rather than here. */
  isDirty: boolean;
  message: string;
  error: string;
  onSave: () => void;
};

/**
 * The workspace/label name editor (URG-214) — feeds the workspace identity
 * card that renders across the app. Same data-ownership split as
 * WorkspaceArtistSection: the value lives in `useWorkspaceIdentityStore`
 * (populated by the card itself, mounted app-wide), this component is
 * purely presentational, and the parent shell owns the save round trip so
 * the store can be updated the instant it succeeds.
 */
export function WorkspaceIdentitySection({
  input,
  onInputChange,
  isLoading,
  isSaving,
  isDirty,
  message,
  error,
  onSave,
}: WorkspaceIdentitySectionProps) {
  return (
    <section className={panelClass}>
      <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Team name</h2>
      {/* Trimmed 2026-08-05 for the two-column row (shares one line with
          Workspace logo now): the heading already says "Workspace identity"
          and the input label right below says "Workspace name", so the old
          "Your label or team name," lead-in was redundant. */}
      <p className="mb-4 text-sm text-content-secondary">
        Shown on the team card across the app.
      </p>
      {isLoading ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-10 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-content-secondary">Team name</span>
            <input
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
              placeholder="e.g. Northside Records"
              maxLength={80}
            />
          </label>
          {message && <p className={feedbackSuccessClass}>{message}</p>}
          {error && <p className={feedbackErrorClass}>{error}</p>}
          {saveButtonVisible({ dirty: isDirty, saving: isSaving }) ? (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : 'Save team name'}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
