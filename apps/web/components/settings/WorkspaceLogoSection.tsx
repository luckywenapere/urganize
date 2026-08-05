'use client';

import Image from 'next/image';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { formatFileSize } from '@/lib/asset-constants';
import { panelClass } from './panelClass';

export type WorkspaceLogo = { fileName: string | null; url: string };

type WorkspaceLogoSectionProps = {
  logo: WorkspaceLogo | null | undefined;
  isLoading: boolean;
  isSaving: boolean;
  message: string;
  error: string;
  mimeAllowlist: string[];
  sizeLimit: number;
  onUpload: (file: File) => void;
  onRemove: () => void;
};

/** Presentational — see WorkspaceArtistSection's note on why data ownership
 * stays in the parent shell. Resurrected 2026-08-04 (URG-214) from
 * `08ab5a5^`, where it was removed along with its Settings UI (2026-07-23) —
 * the API routes it drives stayed dormant and now back the workspace
 * identity card's logo instead. */
export function WorkspaceLogoSection({
  logo,
  isLoading,
  isSaving,
  message,
  error,
  mimeAllowlist,
  sizeLimit,
  onUpload,
  onRemove,
}: WorkspaceLogoSectionProps) {
  return (
    <section className={panelClass}>
      <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Workspace logo</h2>
      {/* Trimmed 2026-08-05 for the two-column row (shares one line with
          Workspace identity now): the heading already says "Workspace logo",
          so this drops the redundant lead-in and the "new and existing...
          until you upload" elaboration, keeping just the core behavior. */}
      <p className="mb-4 text-sm text-content-secondary">
        Shown on releases with no cover art of their own.
      </p>
      {isLoading ? (
        <div className="flex items-center gap-4">
          <SkeletonBlock className="h-24 w-24" />
          <SkeletonBlock className="h-10 w-32 rounded-none" />
        </div>
      ) : (
        <div className="space-y-3">
          {logo ? (
            <div className="flex items-center gap-4">
              <Image
                src={logo.url}
                alt="Workspace logo"
                width={96}
                height={96}
                className="h-24 w-24 border border-stroke-subtle bg-bg-elevated object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-sm text-content-primary">
                  {logo.fileName || 'Logo'}
                </p>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={isSaving}
                  className="mt-1 text-sm text-status-error hover:underline disabled:opacity-60"
                >
                  Remove logo
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-content-secondary">
              No logo yet. JPEG, PNG, or WebP up to {formatFileSize(sizeLimit)}.
            </p>
          )}
          {message && (
            <p className="rounded-none border border-brand/35 bg-brand-muted px-3 py-2 text-sm text-brand">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-none border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
              {error}
            </p>
          )}
          <label
            className={`inline-flex cursor-pointer items-center rounded-none bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover ${
              isSaving ? 'cursor-not-allowed opacity-60' : ''
            }`}
          >
            <input
              type="file"
              className="sr-only"
              accept={mimeAllowlist.join(',')}
              disabled={isSaving}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                // Reset so re-selecting the same file fires onChange.
                event.target.value = '';
                onUpload(file);
              }}
            />
            {isSaving ? 'Uploading…' : logo ? 'Replace logo' : 'Upload logo'}
          </label>
        </div>
      )}
    </section>
  );
}
