'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Loader2, Upload } from '@/components/icons';
import {
  ASSET_CATEGORIES,
  ASSET_MIME_ALLOWLIST,
  type AssetCategory,
  categoryLabel,
  validateAssetUpload,
} from '@/lib/asset-constants';
import { supabase } from '@/lib/supabase/client';
import type { Asset, AssetToastTone } from './AssetSection';

type AssetUploadControlProps = {
  releaseId: string;
  /** Receives the created asset (from the record POST's response) so the
   * parent can append it locally instead of re-fetching the whole list. */
  onUploaded: (asset?: Asset) => void;
  onToast: (message: string, tone: AssetToastTone) => void;
};

type UploadStatus = 'idle' | 'uploading' | 'failed-step-2';

type PendingUpload = {
  file: File;
  category: AssetCategory;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

// Three-step upload flow:
//   1. POST /assets/upload-url → signed upload URL
//   2. PUT file directly to signed URL → bytes land in Supabase Storage
//   3. POST /assets → record asset row, get download URL
//
// Step 3 retries once on transient failure (the storage upload already
// succeeded; a flaky DB write shouldn't waste the upload). Step 2 surfaces
// a Retry button — the previous signed URL may have expired, so the retry
// re-runs from step 1.
async function runUploadFlow(params: {
  releaseId: string;
  file: File;
  category: AssetCategory;
  token: string;
}): Promise<{ ok: true; asset?: Asset } | { ok: false; step: 1 | 2 | 3; error: string }> {
  const { releaseId, file, category, token } = params;
  const mimeType = file.type || 'application/octet-stream';

  // Step 1: get signed upload URL
  let uploadUrl = '';
  let storagePath = '';
  try {
    const res = await fetch(`/api/releases/${releaseId}/assets/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        file_name: file.name,
        mime_type: mimeType,
        file_size: file.size,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      upload_url?: string;
      storage_path?: string;
      error?: string;
    };
    if (!res.ok || !data.upload_url || !data.storage_path) {
      return { ok: false, step: 1, error: data.error || 'Could not create upload URL.' };
    }
    uploadUrl = data.upload_url;
    storagePath = data.storage_path;
  } catch (err) {
    return {
      ok: false,
      step: 1,
      error: err instanceof Error ? err.message : 'Could not create upload URL.',
    };
  }

  // Step 2: PUT bytes directly to Supabase Storage
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: file,
    });
    if (!res.ok) {
      return { ok: false, step: 2, error: `Storage upload failed (${res.status}).` };
    }
  } catch (err) {
    return {
      ok: false,
      step: 2,
      error: err instanceof Error ? err.message : 'Storage upload failed.',
    };
  }

  // Step 3: record asset row, with one silent retry on transient failure
  const recordAsset = async (): Promise<Asset | undefined> => {
    const res = await fetch(`/api/releases/${releaseId}/assets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storage_path: storagePath,
        category,
        file_name: file.name,
        file_size: file.size,
        mime_type: mimeType,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { asset?: Asset; error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Could not record asset.');
    }
    return data.asset;
  };

  try {
    return { ok: true, asset: await recordAsset() };
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      return { ok: true, asset: await recordAsset() };
    } catch (err2) {
      return {
        ok: false,
        step: 3,
        error: err2 instanceof Error ? err2.message : 'Could not record asset.',
      };
    }
  }
}

export function AssetUploadControl({ releaseId, onUploaded, onToast }: AssetUploadControlProps) {
  const [category, setCategory] = useState<AssetCategory>('cover_art');
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [inlineError, setInlineError] = useState('');
  const [pendingRetry, setPendingRetry] = useState<PendingUpload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = status === 'uploading';
  const acceptedMimes = ASSET_MIME_ALLOWLIST[category].join(',');

  const beginUpload = async (file: File, cat: AssetCategory) => {
    setInlineError('');

    const validation = validateAssetUpload({
      category: cat,
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
      file_name: file.name,
    });
    if (!validation.ok) {
      setInlineError(validation.error);
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      onToast('Session expired. Please sign in again.', 'error');
      return;
    }

    setStatus('uploading');
    setPendingRetry(null);

    const result = await runUploadFlow({ releaseId, file, category: cat, token });

    if (result.ok) {
      setStatus('idle');
      onUploaded(result.asset);
      return;
    }

    if (result.step === 2) {
      // Bytes didn't land — let the user retry from step 1 with the same file.
      setStatus('failed-step-2');
      setPendingRetry({ file, category: cat });
      onToast(`Upload failed: ${result.error}`, 'error');
      return;
    }

    if (result.step === 3) {
      // The upload landed but the row didn't. The server cleaned up the
      // orphan on the first try; we already retried once. Tell the user to
      // try again.
      setStatus('idle');
      onToast("Upload succeeded but couldn't record the file. Try uploading again.", 'error');
      return;
    }

    // Step 1 failure — server-side validation or auth, surface verbatim.
    setStatus('idle');
    onToast(result.error, 'error');
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    // Reset the input so re-selecting the same file fires onChange.
    event.target.value = '';
    void beginUpload(file, category);
  };

  const handleRetry = () => {
    if (!pendingRetry) return;
    void beginUpload(pendingRetry.file, pendingRetry.category);
  };

  const handleCategoryChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as AssetCategory;
    setCategory(next);
    setInlineError('');
  };

  return (
    <div className="border border-stroke-default bg-bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block sm:flex-1">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
            Category
          </span>
          {/*
            Native <select> dark-popup fix — same treatment applied to the
            workspace TasksPanel selects: drop the global `.input` class
            (transparent-white bg confuses some browser popup renderers
            despite the page-level color-scheme: dark), set solid dark
            tokens directly, add `[color-scheme:dark]` to the element, and
            style each <option> as a fallback for browsers that honor option
            styling. bg-bg-elevated (vs the TasksPanel selects' bg-bg-surface)
            because this control sits inside an already-bg-bg-surface card —
            elevated keeps the visual depth.
          */}
          <select
            value={category}
            onChange={handleCategoryChange}
            disabled={isUploading}
            className="motion-focus h-10 w-full border border-stroke-default bg-bg-elevated px-3 text-sm text-content-primary transition-colors [color-scheme:dark] hover:border-stroke-strong focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ASSET_CATEGORIES.map((cat) => (
              <option key={cat} value={cat} className="bg-bg-elevated text-content-primary">
                {categoryLabel(cat)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <label
            aria-disabled={isUploading || undefined}
            className={`inline-flex h-10 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover ${
              isUploading ? 'opacity-60' : ''
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept={acceptedMimes}
              onChange={handleFileChange}
              disabled={isUploading}
            />
            {isUploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                Upload file
              </>
            )}
          </label>

          {status === 'failed-step-2' && pendingRetry ? (
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex h-10 items-center border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>

      {inlineError ? (
        <p className="mt-3 text-xs text-status-error">{inlineError}</p>
      ) : null}
    </div>
  );
}
