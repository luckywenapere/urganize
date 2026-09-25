/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { Download, FileText, Trash2 } from '@/components/icons';
import { type AssetCategory, formatFileSize } from '@/lib/asset-constants';
import { supabase } from '@/lib/supabase/client';
import { isNativePlatform } from '@/lib/platform';
import { openExternalUrl } from '@/lib/external-link';
import type { Asset, AssetToastTone } from './AssetSection';

type AssetCategoryGroupProps = {
  category: AssetCategory;
  label: string;
  assets: Asset[];
  releaseId: string;
  onDeleted: (assetId: string) => void;
  onToast: (message: string, tone: AssetToastTone) => void;
};

const IMAGE_CATEGORIES: AssetCategory[] = ['cover_art', 'promo_image'];

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export function AssetCategoryGroup({
  category,
  label,
  assets,
  releaseId,
  onDeleted,
  onToast,
}: AssetCategoryGroupProps) {
  const [deletingId, setDeletingId] = useState('');
  const isImage = IMAGE_CATEGORIES.includes(category);

  const handleDelete = async (asset: Asset) => {
    if (!window.confirm(`Delete "${asset.file_name}"? This cannot be undone.`)) {
      return;
    }

    setDeletingId(asset.id);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/assets/${asset.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        onToast(data.error || 'Could not delete file.', 'error');
        return;
      }
      onDeleted(asset.id);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not delete file.', 'error');
    } finally {
      setDeletingId('');
    }
  };

  // A remote-file target="_blank" anchor commonly opens blank inside the
  // app webview (no "new tab" concept there) — hand it to the system
  // browser instead when running natively; on the web, let the anchor's
  // normal target="_blank" behavior proceed untouched.
  const handleOpenAsset = (event: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    if (isNativePlatform()) {
      event.preventDefault();
      void openExternalUrl(url);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-content-primary">{label}</h3>
        <span className="rounded-full border border-stroke-default bg-bg-elevated px-2 py-0.5 text-[11px] font-semibold text-content-secondary">
          {assets.length}
        </span>
      </div>

      <div className={`mt-3 ${isImage ? 'grid gap-3 sm:grid-cols-2' : 'space-y-1'}`}>
        {assets.map((asset) => {
          const isDeleting = deletingId === asset.id;
          const hasUrl = Boolean(asset.download_url);

          if (isImage) {
            return (
              <div
                key={asset.id}
                className="flex items-center gap-3 border border-stroke-default bg-bg-surface p-3"
              >
                <a
                  href={asset.download_url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => handleOpenAsset(event, asset.download_url ?? '')}
                  className="block h-20 w-20 shrink-0 overflow-hidden border border-stroke-default bg-bg-elevated"
                  aria-label={`Open ${asset.file_name}`}
                >
                  {hasUrl ? (
                    <img
                      src={asset.download_url ?? ''}
                      alt={asset.file_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-content-tertiary">
                      No preview
                    </div>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content-primary">{asset.file_name}</p>
                  <p className="mt-1 text-xs text-content-tertiary">{formatFileSize(asset.file_size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(asset)}
                  disabled={isDeleting}
                  aria-label={`Delete ${asset.file_name}`}
                  className="inline-flex h-8 w-8 items-center justify-center border border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover hover:text-status-error disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          }

          return (
            <div
              key={asset.id}
              className="flex items-center gap-3 border border-stroke-default bg-bg-surface px-4 py-3"
            >
              <FileText className="h-4 w-4 shrink-0 text-content-tertiary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content-primary">{asset.file_name}</p>
                <p className="mt-0.5 text-xs text-content-tertiary">{formatFileSize(asset.file_size)}</p>
              </div>
              {hasUrl ? (
                <a
                  href={asset.download_url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => handleOpenAsset(event, asset.download_url ?? '')}
                  className="inline-flex h-8 items-center gap-1.5 border border-stroke-default bg-bg-elevated px-3 text-xs font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                >
                  <Download className="h-3 w-3" />
                  Download
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => void handleDelete(asset)}
                disabled={isDeleting}
                aria-label={`Delete ${asset.file_name}`}
                className="inline-flex h-8 w-8 items-center justify-center border border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover hover:text-status-error disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
