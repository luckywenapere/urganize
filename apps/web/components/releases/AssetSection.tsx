'use client';

import { useCallback, useMemo } from 'react';
import { type AssetCategory, categoryLabel } from '@/lib/asset-constants';
import { AssetUploadControl } from './AssetUploadControl';
import { AssetCategoryGroup } from './AssetCategoryGroup';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { useSceneData } from './useSceneData';
import { useSceneDataStore } from '@/stores/useSceneDataStore';

export type Asset = {
  id: string;
  release_id: string | null;
  task_id: string | null;
  category: AssetCategory;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  storage_bucket: string;
  storage_path: string;
  created_at: string;
  download_url: string | null;
};

export type AssetToastTone = 'success' | 'error' | 'warning';

type AssetSectionProps = {
  releaseId: string;
  onToast: (message: string, tone: AssetToastTone) => void;
};

const DISPLAY_CATEGORY_ORDER: AssetCategory[] = [
  'cover_art',
  'promo_image',
  'audio',
  'stems',
  'video',
  'document',
  'contract',
  'split_sheet',
  'other',
];

export function AssetSection({ releaseId, onToast }: AssetSectionProps) {
  // Cache-first, but MEMORY-ONLY for this scene: the payload carries 1h signed
  // Storage URLs, so it is never persisted to localStorage and is refused for
  // painting past 45 minutes (see lib/scene-cache.ts). Within a session,
  // re-opening Files is instant; across sessions it always re-signs.
  const {
    data,
    isLoading,
    // Distinguishes "the release has no files" from "the load failed" — a
    // failed fetch used to render the same 'No files attached yet' empty
    // state, telling the user their uploads were gone with only a transient
    // toast to say otherwise.
    error: loadError,
    reload: loadAssets,
  } = useSceneData(releaseId, 'files');
  const setScene = useSceneDataStore((state) => state.setScene);
  const assets = useMemo(() => data?.assets ?? [], [data]);

  const handleUploaded = useCallback(
    (asset?: Asset) => {
      // The record POST already returns the created asset (download URL
      // included) — add it locally like handleDeleted filters, instead of
      // re-fetching the whole list after every single upload. Prepended
      // because the list GET orders newest-first, so the row sits where a
      // reload would put it. The no-asset fallback keeps edge cases correct.
      if (asset) {
        setScene(releaseId, 'files', { assets: [asset, ...assets] });
        return;
      }
      void loadAssets();
    },
    [assets, loadAssets, releaseId, setScene]
  );

  const handleDeleted = useCallback(
    (assetId: string) => {
      setScene(releaseId, 'files', { assets: assets.filter((a) => a.id !== assetId) });
    },
    [assets, releaseId, setScene]
  );

  const assetsByCategory = useMemo(() => {
    const grouped = {} as Record<AssetCategory, Asset[]>;
    for (const asset of assets) {
      const bucket = grouped[asset.category] || [];
      bucket.push(asset);
      grouped[asset.category] = bucket;
    }
    return grouped;
  }, [assets]);

  const visibleCategories = DISPLAY_CATEGORY_ORDER.filter(
    (cat) => (assetsByCategory[cat] || []).length > 0
  );

  return (
    <section className="mt-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Files</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Cover art, masters, contracts, and other release artifacts.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <AssetUploadControl releaseId={releaseId} onUploaded={handleUploaded} onToast={onToast} />
      </div>

      {isLoading && assets.length === 0 ? (
        // Covers the initial load AND a Retry after a failed one — gating on
        // hasLoaded alone made a retry flash the "No files attached yet."
        // empty state for the whole request.
        <div className="mt-4 space-y-2">
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
        </div>
      ) : loadError && assets.length === 0 ? (
        <div className="mt-4 border border-status-error/30 bg-status-error/10 p-4 text-center">
          <p className="text-sm text-status-error">Couldn&rsquo;t load files: {loadError}</p>
          <p className="mt-1 text-xs text-content-secondary">
            Your files are safe — this is a loading problem, not a missing-files problem.
          </p>
          <button
            type="button"
            onClick={() => void loadAssets()}
            className="mt-3 inline-flex h-9 items-center border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover"
          >
            Retry
          </button>
        </div>
      ) : assets.length === 0 ? (
        <div className="mt-4 border border-stroke-default bg-bg-surface p-4 text-center">
          <p className="text-sm text-content-secondary">No files attached yet.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {visibleCategories.map((cat) => (
            <AssetCategoryGroup
              key={cat}
              category={cat}
              label={categoryLabel(cat)}
              assets={assetsByCategory[cat] || []}
              releaseId={releaseId}
              onDeleted={handleDeleted}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </section>
  );
}
