'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Release } from '@/types/releases';
import { AssetSection, type AssetToastTone } from '@/components/releases/AssetSection';
import { Toast } from '@/components/shared/Toast';

type ToastState = {
  message: string;
  tone: AssetToastTone;
};

type FilesPanelProps = {
  scopedRelease: Pick<Release, 'id' | 'title' | 'artistName'> | null;
};

/**
 * Workspace-side files surface. When a release is scoped via `?release=` (read
 * by useReleaseScope and lifted to WorkspaceView), this renders the reused
 * AssetSection from components/releases/ — same fetcher, same upload control,
 * same per-release storage rows. With no scope, surfaces a one-line hint
 * instead of dumping every file across every release.
 */
export function FilesPanel({ scopedRelease }: FilesPanelProps) {
  const [toast, setToast] = useState<ToastState | null>(null);

  // Stable identity for AssetSection's loadAssets useCallback so its useEffect
  // doesn't refetch on every render of this panel.
  const handleToast = useCallback((message: string, tone: AssetToastTone) => {
    setToast({ message, tone });
  }, []);

  // Auto-dismiss: warnings hold longer so the user has time to read blocker
  // explanations; everything else clears in ~2.6s. Mirrors the legacy Tasks
  // page convention. (Resetting on scope change is handled by `key=` on the
  // FilesPanel call site, not an effect — see React docs on "Resetting state
  // with a key".)
  useEffect(() => {
    if (!toast) return;
    const dismissAfterMs = toast.tone === 'warning' ? 6000 : 2600;
    const timeout = window.setTimeout(() => setToast(null), dismissAfterMs);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!scopedRelease) {
    return (
      <section
        aria-labelledby="workspace-files-heading"
        className="mt-8 border border-stroke-default bg-bg-surface px-4 py-4"
      >
        <h2
          id="workspace-files-heading"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary"
        >
          Files
        </h2>
        <p className="mt-2 text-sm text-content-secondary">
          Select a release to see its files.
        </p>
      </section>
    );
  }

  return (
    <div>
      <AssetSection releaseId={scopedRelease.id} onToast={handleToast} />
      {toast ? (
        <div className="mt-3">
          <Toast message={toast.message} tone={toast.tone} />
        </div>
      ) : null}
    </div>
  );
}
