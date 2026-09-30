'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Loader2, Trash2, Upload } from '@/components/icons';
import { readImageDimensions } from '@/lib/cover-art-image';
import {
  PRESS_PHOTO_FILE_ACCEPT,
  PRESS_PHOTO_FORMATS_LABEL,
  PRESS_PHOTO_USAGE_RIGHTS,
  gradePressPhoto,
  validatePressPhotoFile,
} from '@/lib/press-photo';
import { MAX_PRESS_PHOTO_BYTES, formatFileSize } from '@/lib/asset-constants';
import { requestPressPhotoDownload, uploadPressPhoto } from '@/lib/press-photo-upload';
import { accessToken, authHeaders, readError } from './press-kit-client';
import type { PressKitAsset } from '@/types/press-kits';

/**
 * The photos on a kit.
 *
 * Plain `<img>` with an `onError`, never `next/image`: these are signed URLs
 * that expire in an hour, and the optimizer would proxy and cache them past
 * their life. The public press kit page does the same, for the same reason.
 *
 * Reordering is up and down buttons rather than drag. Native HTML5 drag does
 * not work on touch at all, and this has to work on a phone, which is the same
 * call the setlist builder made.
 */

const inputClass =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-sm text-content-primary ' +
  'placeholder:text-content-tertiary focus:border-brand focus:outline-none disabled:opacity-60';

const gradeToneClass = (verdict: string): string =>
  verdict === 'warning' ? 'text-status-warning' : 'text-content-tertiary';

export function PhotoGrid({
  kitId,
  assets,
  onAssetsChange,
  readOnly = false,
}: {
  kitId: string;
  assets: PressKitAsset[];
  onAssetsChange: (assets: PressKitAsset[]) => void;
  readOnly?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [brokenUrls, setBrokenUrls] = useState<string[]>([]);

  const patchAsset = async (assetId: string, patch: Record<string, unknown>) => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusyId(assetId);
    setError('');
    try {
      const response = await fetch(`/api/press-kits/${kitId}/assets/${assetId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setError(await readError(response, 'Could not save that change.'));
        return;
      }
      const body = await response.json();
      if (Array.isArray(body.assets)) onAssetsChange(body.assets);
    } catch {
      setError('Could not save that change.');
    } finally {
      setBusyId('');
    }
  };

  const removeAsset = async (asset: PressKitAsset) => {
    if (!window.confirm(`Remove ${asset.fileName}? This cannot be undone.`)) return;
    const headers = await authHeaders();
    if (!headers) return;
    setBusyId(asset.id);
    setError('');
    try {
      const response = await fetch(`/api/press-kits/${kitId}/assets/${asset.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        setError(await readError(response, 'Could not remove that photo.'));
        return;
      }
      const body = await response.json();
      if (Array.isArray(body.assets)) onAssetsChange(body.assets);
    } catch {
      setError('Could not remove that photo.');
    } finally {
      setBusyId('');
    }
  };

  /**
   * Swap two photos' positions.
   *
   * Two PATCHes rather than one bulk call, because the route returns the whole
   * set each time and the second answer is the one that is right. At the
   * handful of photos a kit holds, the extra round trip costs nothing worth a
   * bulk endpoint.
   */
  const move = async (index: number, direction: -1 | 1) => {
    const target = assets[index + direction];
    const current = assets[index];
    if (!target || !current) return;
    setBusyId(current.id);
    await patchAsset(current.id, { position: target.position });
    await patchAsset(target.id, { position: current.position });
  };

  const download = async (asset: PressKitAsset) => {
    setBusyId(asset.id);
    setError('');
    const token = await accessToken();
    const result = await requestPressPhotoDownload({ kitId, assetId: asset.id, token });
    setBusyId('');
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Navigated to rather than given a `download` attribute: the file is on
    // another origin, where that attribute is ignored, so the filename comes
    // from the signed URL's own content-disposition instead.
    window.location.href = result.url;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');
    setUploading(true);
    const token = await accessToken();
    let latest = assets;

    for (const file of Array.from(files)) {
      const check = validatePressPhotoFile(file);
      if (!check.ok) {
        setError(check.error);
        continue;
      }

      const dimensions = await readImageDimensions(file);
      const grade = gradePressPhoto(dimensions);
      if (grade.verdict === 'blocked') {
        setError(`${file.name}: ${grade.headline} ${grade.detail}`.trim());
        continue;
      }

      const outcome = await uploadPressPhoto({ kitId, file, token, dimensions });
      if (!outcome.ok) {
        setError(outcome.error);
        continue;
      }
      latest = [...latest, outcome.asset];
      onAssetsChange(latest);
    }

    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="space-y-4">
      {readOnly ? null : (
        <div className="rounded-lg border border-dashed border-stroke-default p-4">
          <input
            ref={fileInput}
            type="file"
            accept={PRESS_PHOTO_FILE_ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="motion-focus inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-content-inverse disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            {uploading ? 'Uploading' : 'Add photos'}
          </button>
          <p className="mt-2 text-xs text-content-tertiary">
            {PRESS_PHOTO_FORMATS_LABEL}, up to {formatFileSize(MAX_PRESS_PHOTO_BYTES)} each. Press
            want the full size file, not a screenshot.
          </p>
        </div>
      )}

      {error ? <p role="alert" className="text-sm text-status-error">{error}</p> : null}

      {assets.length === 0 ? (
        <p className="text-sm text-content-tertiary">
          No photos yet. A kit without one gets skipped, so this is worth doing early.
        </p>
      ) : null}

      <ul className="space-y-3">
        {assets.map((asset, index) => {
          const grade =
            asset.width && asset.height
              ? gradePressPhoto({ width: asset.width, height: asset.height })
              : null;
          const broken = !asset.url || brokenUrls.includes(asset.url);
          const busy = busyId === asset.id;

          return (
            <li
              key={asset.id}
              className="rounded-lg border border-stroke-default bg-bg-base p-3 sm:flex sm:gap-4"
            >
              <div className="mb-3 shrink-0 sm:mb-0 sm:w-40">
                {broken ? (
                  <div className="flex h-28 w-full items-center justify-center rounded-md bg-bg-elevated text-xs text-content-tertiary">
                    Preview unavailable
                  </div>
                ) : (
                  // A signed Storage URL with a one hour life. next/image
                  // would proxy and cache it past its own expiry.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url || ''}
                    alt={asset.fileName}
                    loading="lazy"
                    onError={() =>
                      setBrokenUrls((current) =>
                        asset.url && !current.includes(asset.url)
                          ? [...current, asset.url]
                          : current
                      )
                    }
                    className="h-28 w-full rounded-md object-cover"
                  />
                )}
                <p className="mt-1 truncate font-mono text-[11px] text-content-tertiary">
                  {asset.fileName}
                </p>
                {grade ? (
                  <p className={`mt-0.5 text-[11px] ${gradeToneClass(grade.verdict)}`}>
                    {asset.width} x {asset.height}
                    {grade.verdict === 'warning' ? ' · thin for print' : ''}
                  </p>
                ) : null}
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <label className="block">
                  <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
                    Photographer
                  </span>
                  <input
                    type="text"
                    defaultValue={asset.photographerCredit}
                    disabled={readOnly || busy}
                    placeholder="Who took it"
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value !== asset.photographerCredit) {
                        void patchAsset(asset.id, { photographerCredit: value });
                      }
                    }}
                    className={inputClass}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
                    What press may do with it
                  </span>
                  <select
                    value={asset.usageRights}
                    disabled={readOnly || busy}
                    onChange={(event) =>
                      void patchAsset(asset.id, { usageRights: event.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="">Not set</option>
                    {PRESS_PHOTO_USAGE_RIGHTS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    {asset.usageRights &&
                    !PRESS_PHOTO_USAGE_RIGHTS.some(
                      (option) => option.value === asset.usageRights
                    ) ? (
                      // A row could already hold a sentence somebody typed.
                      // Showing it beats reporting the photo as having no
                      // rights set at all.
                      <option value={asset.usageRights}>{asset.usageRights}</option>
                    ) : null}
                  </select>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void download(asset)}
                    disabled={busy}
                    className="motion-focus inline-flex items-center gap-1.5 rounded-md border border-stroke-default px-2.5 py-1.5 text-xs text-content-secondary hover:bg-bg-hover disabled:opacity-60"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Download
                  </button>
                  {readOnly ? null : (
                    <>
                      <button
                        type="button"
                        onClick={() => void move(index, -1)}
                        disabled={busy || index === 0}
                        aria-label={`Move ${asset.fileName} earlier`}
                        className="motion-focus inline-flex items-center rounded-md border border-stroke-default px-2 py-1.5 text-content-secondary hover:bg-bg-hover disabled:opacity-40"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => void move(index, 1)}
                        disabled={busy || index === assets.length - 1}
                        aria-label={`Move ${asset.fileName} later`}
                        className="motion-focus inline-flex items-center rounded-md border border-stroke-default px-2 py-1.5 text-content-secondary hover:bg-bg-hover disabled:opacity-40"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAsset(asset)}
                        disabled={busy}
                        className="motion-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-content-secondary hover:bg-bg-hover hover:text-status-error disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
