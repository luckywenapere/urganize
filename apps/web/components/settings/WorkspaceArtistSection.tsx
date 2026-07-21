'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { panelClass } from './panelClass';

export type WorkspaceArtist = { id: string; name: string; slug: string };

type WorkspaceArtistSectionProps = {
  artist: WorkspaceArtist | null | undefined;
  input: string;
  onInputChange: (value: string) => void;
  isLoading: boolean;
  isSaving: boolean;
  message: string;
  error: string;
  onSave: () => void;
};

/**
 * Data is fetched once by the parent shell (SettingsPageClient) alongside
 * Workspace logo and Teammates, sharing one hoisted access-token resolution
 * — see the parent's redundant-network-call fix. This component is purely
 * presentational so that fix stays possible.
 */
export function WorkspaceArtistSection({
  artist,
  input,
  onInputChange,
  isLoading,
  isSaving,
  message,
  error,
  onSave,
}: WorkspaceArtistSectionProps) {
  return (
    <section className={`${panelClass} mt-6`}>
      <h2 className="mb-1 text-xl">Workspace artist</h2>
      <p className="mb-4 text-sm text-content-secondary">
        The single artist this workspace works on. Renaming here updates
        every release&apos;s cached artist label.
      </p>
      {isLoading ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-10 w-full rounded-lg" />
        </div>
      ) : artist === undefined ? (
        <p className="text-sm text-content-secondary">
          No workspace artist yet. Create a release to seed one.
        </p>
      ) : artist === null ? (
        <p className="text-sm text-content-secondary">Could not load workspace artist.</p>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-content-secondary">Artist name</span>
            <input
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
              placeholder="e.g. Tems"
              maxLength={120}
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
            {isSaving ? 'Saving…' : 'Save artist name'}
          </button>
        </div>
      )}
    </section>
  );
}
