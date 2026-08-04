'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { panelClass } from './panelClass';

type WorkspaceIdentitySectionProps = {
  input: string;
  onInputChange: (value: string) => void;
  isLoading: boolean;
  isSaving: boolean;
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
  message,
  error,
  onSave,
}: WorkspaceIdentitySectionProps) {
  return (
    <section className={panelClass}>
      <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Workspace identity</h2>
      <p className="mb-4 text-sm text-content-secondary">
        Your label or team name, shown on the workspace card across the app.
      </p>
      {isLoading ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-10 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-content-secondary">Workspace name</span>
            <input
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
              placeholder="e.g. Northside Records"
              maxLength={80}
            />
          </label>
          {message && (
            <p className="rounded-lg border border-brand/35 bg-brand-muted px-3 py-2 text-sm text-brand">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : 'Save workspace name'}
          </button>
        </div>
      )}
    </section>
  );
}
