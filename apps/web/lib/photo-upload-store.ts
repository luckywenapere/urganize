'use client';

import { createStore, type StoreApi } from 'zustand/vanilla';
import { uploadPhotoFile } from '@/lib/photo-upload-client';
import type { UploadSurface } from '@/lib/upload-failure-report';

// The upload half of usePhotoUpload (components/shared/usePhotoUpload.ts),
// kept outside React so a run survives an unmount and can be tested.

export type PhotoUploadState = {
  status: 'idle' | 'uploading' | 'error';
  /** Readable sentence plus code, for surfaces that show it. */
  error: string;
  /** The cropped file of the last failed (or running) upload, for retry. */
  pending: File | null;
  /** An object URL of `pending`, so the face can show it under the veil. */
  previewUrl: string | null;
};

const INITIAL: PhotoUploadState = { status: 'idle', error: '', pending: null, previewUrl: null };

export function createPhotoUploadStore(): StoreApi<PhotoUploadState> {
  return createStore<PhotoUploadState>(() => ({ ...INITIAL }));
}

export type PhotoUploadOptions = {
  /** POST endpoint that returns { upload_url, storage_path }. */
  signUrl: string;
  /** Persist the path (or null to remove); resolves to the new signed URL. */
  save: (photoPath: string | null) => Promise<string | null>;
  surface: UploadSurface;
  /** Runs when a photo is saved or removed, even after the caller unmounted. */
  onSaved: (photoUrl: string | null, info: { removed: boolean }) => void;
  store?: StoreApi<PhotoUploadState>;
};

function previewOf(file: File): string | null {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

function revoke(url: string | null) {
  if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Nothing to free.
  }
}

/**
 * Run one upload against `store`. Plain async, so it keeps going when the
 * screen that started it unmounts. A second start while one runs is ignored.
 * On failure the cropped file stays in the store, so a retry re-sends it.
 */
export async function runPhotoUpload(
  store: StoreApi<PhotoUploadState>,
  options: Pick<PhotoUploadOptions, 'signUrl' | 'save' | 'surface' | 'onSaved'>,
  file: File
): Promise<boolean> {
  const current = store.getState();
  if (current.status === 'uploading') return false;
  const sameFile = current.pending === file && Boolean(current.previewUrl);
  if (!sameFile) revoke(current.previewUrl);
  const previewUrl = sameFile ? current.previewUrl : previewOf(file);
  store.setState({ status: 'uploading', error: '', pending: file, previewUrl });
  try {
    const url = await uploadPhotoFile({
      signUrl: options.signUrl,
      body: file,
      save: (path) => options.save(path),
      surface: options.surface,
    });
    revoke(previewUrl);
    store.setState({ ...INITIAL });
    options.onSaved(url, { removed: false });
    return true;
  } catch (error) {
    store.setState({
      status: 'error',
      error: error instanceof Error ? error.message : 'Could not save the photo.',
      pending: file,
      previewUrl,
    });
    return false;
  }
}

/** Forget a failed upload (the person skipped it). Never interrupts a run. */
export function resetPhotoUploadStore(store: StoreApi<PhotoUploadState>): void {
  const current = store.getState();
  if (current.status === 'uploading') return;
  revoke(current.previewUrl);
  store.setState({ ...INITIAL });
}
