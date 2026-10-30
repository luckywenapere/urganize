'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { useStore } from 'zustand';
import { prepareAvatarImage } from '@/lib/downscale-image';
import {
  createPhotoUploadStore,
  resetPhotoUploadStore,
  runPhotoUpload,
  type PhotoUploadOptions,
} from '@/lib/photo-upload-store';

export type { PhotoUploadOptions } from '@/lib/photo-upload-store';

/**
 * Pick, downscale, crop, sign, PUT, save (2026-10-30, lifted out of
 * ProfilePhotoPicker so the account photo surfaces share it).
 *
 * The UPLOAD lives in a small zustand store (lib/photo-upload-store.ts), not in
 * component state. By default each caller gets its own; pass a shared `store`
 * when the upload must outlive the screen (the onboarding photo row: tapping
 * Continue mid-upload unmounts the row, the upload keeps going, and the avatar
 * store hears about it when it lands). `retry()` re-sends the SAME cropped file
 * kept in that store, without reopening the picker or the crop step.
 *
 * No refs: the hidden file input is held in state through `bindInput` (a
 * callback ref), so callers may read everything here during render.
 */
export function usePhotoUpload(options: PhotoUploadOptions) {
  const [ownStore] = useState(createPhotoUploadStore);
  const store = options.store ?? ownStore;
  const state = useStore(store);
  const [input, bindInput] = useState<HTMLInputElement | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [cropping, setCropping] = useState<File | null>(null);
  const [localError, setLocalError] = useState('');

  // A store this hook made is gone with it: release its preview image. A
  // shared store (onboarding) outlives the screen on purpose and is left be.
  useEffect(() => {
    if (options.store) return;
    return () => resetPhotoUploadStore(ownStore);
  }, [options.store, ownStore]);

  const uploading = state.status === 'uploading';
  const busy = preparing || removing || uploading;

  const pick = () => {
    if (!busy) input?.click();
  };

  // Shrink first (a phone original can be past what a browser will decode),
  // then hand it to the crop step. 2048px leaves room to zoom in sharply.
  const choose = async (file: File) => {
    setLocalError('');
    // A new pick replaces a failed one: its error and kept file go now, as
    // the picker did before this hook existed.
    resetPhotoUploadStore(store);
    setPreparing(true);
    try {
      const prepared = await prepareAvatarImage(file, 2048);
      if (!prepared) {
        setLocalError('Could not read that image. Try a JPEG.');
        return;
      }
      setCropping(prepared.file);
    } finally {
      setPreparing(false);
      if (input) input.value = '';
    }
  };

  /** `file` is the cropped square, already small. */
  const start = (file: File) => {
    setLocalError('');
    return runPhotoUpload(store, options, file);
  };

  const confirmCrop = (file: File) => {
    setCropping(null);
    void start(file);
  };

  const cancelCrop = () => setCropping(null);

  /** Re-send the same cropped photo. No picker, no crop step. */
  const retry = () => {
    const pending = store.getState().pending;
    if (pending) void start(pending);
    else input?.click();
  };

  const remove = async () => {
    setLocalError('');
    setRemoving(true);
    try {
      const url = await options.save(null);
      options.onSaved(url, { removed: true });
    } catch (removeError) {
      setLocalError(removeError instanceof Error ? removeError.message : 'Could not remove the photo.');
    } finally {
      setRemoving(false);
    }
  };

  /** Forget a failed upload (the person skipped it or picked another). */
  const reset = () => {
    resetPhotoUploadStore(store);
    setLocalError('');
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void choose(file);
  };

  return {
    bindInput,
    onFileChange,
    pick,
    choose,
    cropping,
    confirmCrop,
    cancelCrop,
    retry,
    remove,
    reset,
    start,
    busy,
    preparing,
    uploading,
    removing,
    failed: state.status === 'error',
    error: localError || state.error,
    previewUrl: state.previewUrl,
  };
}
