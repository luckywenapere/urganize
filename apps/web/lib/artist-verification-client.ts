'use client';

import { getAccessToken } from '@/components/settings/getAccessToken';
import { MAX_PROFILE_PHOTO_BYTES, isProfilePhotoMimeType } from '@/lib/profile-photo';
import type { VerificationProvider } from '@/lib/artist-verification';

// Sends one screenshot to verify an artist (issue #1390): sign an upload, put
// the image straight to storage, then tell the server it is there. Throws a
// sentence a person can read.

const verificationUrl = (artistId: string): string =>
  `/api/workspace/artists/${encodeURIComponent(artistId)}/verification`;

/** A screenshot is an ordinary image. Checked before any upload starts. */
export function checkScreenshotFile(file: File): string | null {
  if (!isProfilePhotoMimeType(file.type)) return 'Use a JPEG, PNG or WebP screenshot.';
  if (file.size <= 0) return 'That file looks empty.';
  if (file.size > MAX_PROFILE_PHOTO_BYTES) return 'The screenshot must be 5 MB or smaller.';
  return null;
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  return new Error(typeof payload.error === 'string' ? payload.error : fallback);
}

export async function sendVerificationScreenshot(
  artistId: string,
  file: File,
  provider: VerificationProvider
): Promise<void> {
  const problem = checkScreenshotFile(file);
  if (problem) throw new Error(problem);

  const token = await getAccessToken();
  if (!token) throw new Error('Sign in again to send the screenshot.');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const signed = await fetch(verificationUrl(artistId), {
    method: 'POST',
    headers,
    body: JSON.stringify({ file_name: file.name || 'screenshot.png', mime_type: file.type, file_size: file.size }),
  });
  if (!signed.ok) throw await readError(signed, 'Could not start the upload. Try again.');
  const { upload_url: uploadUrl, storage_path: storagePath } = (await signed.json()) as {
    upload_url?: string;
    storage_path?: string;
  };
  if (!uploadUrl || !storagePath) throw new Error('Could not start the upload. Try again.');

  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!put.ok) throw new Error('The upload did not finish. Try again.');

  const saved = await fetch(verificationUrl(artistId), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ screenshotPath: storagePath, provider }),
  });
  if (!saved.ok) throw await readError(saved, 'Could not send the screenshot. Try again.');
}
