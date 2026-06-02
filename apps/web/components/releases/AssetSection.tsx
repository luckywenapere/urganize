'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type AssetCategory, categoryLabel } from '@/lib/asset-constants';
import { supabase } from '@/lib/supabase/client';
import { AssetUploadControl } from './AssetUploadControl';
import { AssetCategoryGroup } from './AssetCategoryGroup';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

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

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export function AssetSection({ releaseId, onToast }: AssetSectionProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/assets`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as { assets?: Asset[]; error?: string };
      if (!res.ok) {
        onToast(data.error || 'Could not load files.', 'error');
        return;
      }
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not load files.', 'error');
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [onToast, releaseId]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const handleUploaded = useCallback(() => {
    void loadAssets();
  }, [loadAssets]);

  const handleDeleted = useCallback((assetId: string) => {
    setAssets((current) => current.filter((a) => a.id !== assetId));
  }, []);

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

      {isLoading && !hasLoaded ? (
        <div className="mt-4 space-y-2">
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
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
