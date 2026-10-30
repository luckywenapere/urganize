import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadPhotoFile = vi.fn();
vi.mock('./photo-upload-client', () => ({ uploadPhotoFile: (input: unknown) => uploadPhotoFile(input) }));

import { createPhotoUploadStore, resetPhotoUploadStore, runPhotoUpload } from './photo-upload-store';

const file = new File([new Uint8Array([1, 2, 3])], 'face.jpg', { type: 'image/jpeg' });
const options = (onSaved = vi.fn()) => ({
  signUrl: '/api/account/photo/sign',
  save: vi.fn(),
  surface: 'account_photo' as const,
  onSaved,
});

describe('runPhotoUpload', () => {
  beforeEach(() => uploadPhotoFile.mockReset());

  it('saves, clears the store and tells the caller', async () => {
    uploadPhotoFile.mockResolvedValue('https://signed/photo');
    const store = createPhotoUploadStore();
    const onSaved = vi.fn();
    expect(await runPhotoUpload(store, options(onSaved), file)).toBe(true);
    expect(onSaved).toHaveBeenCalledWith('https://signed/photo', { removed: false });
    expect(store.getState()).toMatchObject({ status: 'idle', pending: null, error: '' });
  });

  it('keeps the cropped file after a failure, and retry re-sends the same one', async () => {
    uploadPhotoFile.mockRejectedValueOnce(new Error('The upload did not finish. (PHOTO-2-NET)'));
    const store = createPhotoUploadStore();
    expect(await runPhotoUpload(store, options(), file)).toBe(false);
    expect(store.getState()).toMatchObject({ status: 'error', pending: file });
    expect(store.getState().error).toContain('PHOTO-2-NET');

    uploadPhotoFile.mockResolvedValueOnce('https://signed/photo');
    const pending = store.getState().pending as File;
    expect(await runPhotoUpload(store, options(), pending)).toBe(true);
    expect(uploadPhotoFile.mock.calls[1][0]).toMatchObject({ body: file });
  });

  it('ignores a second start while one is running', async () => {
    let finish: (value: string) => void = () => undefined;
    uploadPhotoFile.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    const store = createPhotoUploadStore();
    const first = runPhotoUpload(store, options(), file);
    expect(store.getState().status).toBe('uploading');
    expect(await runPhotoUpload(store, options(), file)).toBe(false);
    resetPhotoUploadStore(store);
    expect(store.getState().status).toBe('uploading');
    finish('https://signed/photo');
    expect(await first).toBe(true);
    expect(uploadPhotoFile).toHaveBeenCalledTimes(1);
  });

  it('a skip forgets a failed upload', async () => {
    uploadPhotoFile.mockRejectedValueOnce(new Error('no'));
    const store = createPhotoUploadStore();
    await runPhotoUpload(store, options(), file);
    resetPhotoUploadStore(store);
    expect(store.getState()).toMatchObject({ status: 'idle', pending: null });
  });
});
