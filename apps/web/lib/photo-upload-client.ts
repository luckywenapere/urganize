'use client';

import { supabase } from '@/lib/supabase/client';
import { captureAnalyticsEvent, createPostHogEvent } from '@/lib/analytics';
import { uploadThumb } from '@/lib/image-thumb-client';
import {
  buildUploadFailureReport,
  formatUploadFailureCode,
  type UploadStep,
  type UploadSurface,
} from '@/lib/upload-failure-report';

/**
 * The three-step signed photo upload, outside React (lifted out of
 * ProfilePhotoPicker on 2026-10-30): sign (POST `signUrl`), PUT the bytes to
 * storage, then `save(path)`. Plain async so an upload can outlive the screen
 * that started it (the onboarding photo row keeps going after Continue).
 *
 * Throws an Error whose message is a readable sentence plus a pasteable code
 * (`PHOTO-2-NET`), and reports `asset_upload_failed`, the same as before.
 */
export async function uploadPhotoFile(input: {
  signUrl: string;
  body: File;
  save: (photoPath: string) => Promise<string | null>;
  surface: UploadSurface;
}): Promise<string | null> {
  const { signUrl, body, save, surface } = input;
  let step: UploadStep = 1;
  let status: number | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in again to change the photo.');

    const signResponse = await fetch(signUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: body.name, mime_type: body.type, file_size: body.size }),
    });
    const signed = (await signResponse.json().catch(() => null)) as {
      upload_url?: string;
      storage_path?: string;
      thumb_upload_url?: string | null;
      error?: string;
    } | null;
    if (!signResponse.ok || !signed?.upload_url || !signed.storage_path) {
      status = signResponse.status;
      throw new Error(signed?.error || 'Could not start the upload.');
    }

    step = 2;
    // The 384px display copy rides alongside (lib/image-thumb-client.ts):
    // best effort, never fails the save, and lands before it so the
    // roster reload reads it.
    const thumbDone = uploadThumb(signed.thumb_upload_url, body);
    const put = await fetch(signed.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': body.type },
      body,
    });
    if (!put.ok) {
      status = put.status;
      throw new Error('The upload did not finish.');
    }

    await thumbDone;
    step = 3;
    return await save(signed.storage_path);
  } catch (uploadError) {
    const code = formatUploadFailureCode({ surface, step, status });
    const detail = uploadError instanceof Error ? uploadError.message : 'Could not save the photo.';
    captureAnalyticsEvent(
      createPostHogEvent(
        'asset_upload_failed',
        buildUploadFailureReport({
          surface,
          step,
          status,
          message: uploadError instanceof Error ? uploadError.message : null,
        })
      )
    );
    throw new Error(`${detail} (${code})`);
  }
}
