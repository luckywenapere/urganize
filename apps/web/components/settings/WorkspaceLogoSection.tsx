'use client';

import { useState } from 'react';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { formatFileSize } from '@/lib/asset-constants';
import { panelClass } from './panelClass';
import { feedbackErrorClass, feedbackSuccessClass } from './feedback';

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
  // Which URL failed to load, rather than a bare "it failed" boolean: a signed
  // URL that expired (or an object deleted out of band) otherwise leaves the
  // fallback stuck forever, so the NEXT successful upload would still read "No
  // preview". Comparing against the current url resets it for free when a new
  // logo arrives, with no effect to keep in sync.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const logoFailed = Boolean(logo?.url) && failedUrl === logo?.url;

  return (
    <section className={panelClass}>
      <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Team logo</h2>
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
          <SkeletonBlock className="h-10 w-32 rounded-lg" />
        </div>
      ) : (
        <div className="space-y-3">
          {logo ? (
            <div className="flex items-center gap-4">
              {/* A plain <img>, not next/image, matching what
                  WorkspaceIdentityPanel already does with this exact URL and
                  for the reason recorded there: this is a 1h SIGNED Storage
                  URL, and routing it through the /_next/image optimizer both
                  proxies and caches something built to expire. It also needs an
                  onError — the optimizer path had none, so once the TTL lapsed
                  the preview broke with no fallback and nothing to click. */}
              {logoFailed ? (
                <div className="grid h-24 w-24 place-items-center border border-stroke-subtle bg-bg-elevated text-[11px] text-content-tertiary">
                  No preview
                </div>
              ) : (
                // A signed Storage URL, same rationale as WorkspaceIdentityPanel.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo.url}
                  alt="Team logo"
                  width={96}
                  height={96}
                  onError={() => setFailedUrl(logo.url)}
                  className="h-24 w-24 border border-stroke-subtle bg-bg-elevated object-cover"
                />
              )}
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
          {/* rounded-lg, matching WorkspaceIdentitySection (2026-08-13): these
              two sections sit in the same two-column row, and this one had been
              rendering sharp corners against its sibling's rounded ones. */}
          {message && <p className={feedbackSuccessClass}>{message}</p>}
          {error && <p className={feedbackErrorClass}>{error}</p>}
          <label
            className={`inline-flex cursor-pointer items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover ${
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
