import { openExternalUrl } from '@/lib/external-link';
import { request, shellSupports } from '@/lib/native-bridge';
import { isNativePlatform } from '@/lib/platform';

/**
 * Hand a generated image to the user: the native share sheet inside the app,
 * a normal download on the web.
 *
 * Three paths, in order of preference:
 *
 *  1. Native, in a shell that advertises `shareFile`. The share sheet needs a
 *     local file, not a remote URL, so the page fetches the bytes (it holds the
 *     session a signed URL was minted for) and hands them to the shell as
 *     base64; the shell writes them to its cache directory and shares that.
 *  2. Native WITHOUT that capability. A webview cannot download, so the image
 *     goes to the system browser where it can be saved by long press. This is
 *     why the capability is checked at runtime rather than assumed.
 *  3. Web. The image lives on Supabase Storage, so a plain `download` attribute
 *     is ignored (cross origin). Fetching to a blob and clicking an object URL
 *     is the only thing that actually saves a file.
 */
export type ShareOutcome = 'shared' | 'downloaded' | 'opened' | 'cancelled';

const CANCELLED_PATTERN = /cancel|abort|dismiss/i;

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked so a multi-megabyte PNG cannot blow the argument limit on
  // String.fromCharCode.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick: revoking synchronously can race the download in
  // some browsers.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function shareOrDownloadImage({
  url,
  fileName,
  title,
}: {
  url: string;
  fileName: string;
  title?: string;
}): Promise<ShareOutcome> {
  const native = isNativePlatform();
  const canShareNatively = native && shellSupports('shareFile');

  if (canShareNatively) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not fetch the image (${response.status}).`);
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);

      const { outcome } = await request(
        'shareFile',
        { kind: 'base64', data: base64, fileName, mimeType: blob.type || 'image/png', title },
        // Includes the time the share sheet sits open waiting on a person.
        { timeoutMs: 300_000 }
      );
      return outcome;
    } catch (error) {
      // Dismissing the share sheet rejects. That is a normal user action, not a
      // failure, so it must not fall through to opening a browser tab.
      const message = error instanceof Error ? error.message : String(error);
      if (CANCELLED_PATTERN.test(message)) return 'cancelled';
      console.error('[share] native share failed, opening in the system browser', error);
      await openExternalUrl(url);
      return 'opened';
    }
  }

  if (native) {
    await openExternalUrl(url);
    return 'opened';
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch the image (${response.status}).`);
  downloadBlob(await response.blob(), fileName);
  return 'downloaded';
}

/**
 * Share to socials (2026-09-23): hand an image we already hold IN MEMORY to
 * another app, so it can land in Instagram or a WhatsApp status.
 *
 * Different from shareOrDownloadImage above for two reasons worth knowing:
 *
 *  1. The bytes arrive from our own API with an Authorization header, so there
 *     is no URL a browser could open. The file is a File object from the start.
 *  2. On the WEB this is the whole point, not a fallback. A phone browser's
 *     share sheet takes real files through the Web Share API, and that sheet
 *     is where Instagram and WhatsApp live. shareOrDownloadImage only
 *     downloads on the web, which on a phone leaves the image in Files and the
 *     person to find their own way to Instagram.
 *
 * USER ACTIVATION, the rule that decides the shape: a browser only opens the
 * share sheet inside the tap that asked for it. So `navigator.share` must be
 * the FIRST thing awaited on the web path, and the caller must already hold
 * the File, rendered before the tap rather than fetched after it. Awaiting a
 * network call first is how this silently fails on iOS Safari.
 */
export type ShareFileOutcome = 'shared' | 'downloaded' | 'cancelled' | 'unsupported';

function isAbort(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return CANCELLED_PATTERN.test(message);
}

/**
 * Can this device hand a file to other apps? True inside an app build whose
 * shell can share files, and in a TOUCH browser whose share sheet accepts files.
 *
 * Desktop browsers implement the same API, but the menu they open (AirDrop,
 * Mail, a Windows share panel) has no Instagram and no WhatsApp status in it,
 * so a computer saves the file instead, which is the thing people can use.
 * `pointer: coarse` rather than a width, so a landscape iPad still shares.
 */
export function canShareFilesToApps(file: File): boolean {
  if (isNativePlatform()) return shellSupports('shareFile');
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (!coarse) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Save a file we hold in memory, the web's only real "download". */
export function downloadFile(file: Blob, fileName: string): void {
  downloadBlob(file, fileName);
}

export async function shareFileToApps({
  file,
  title,
  text,
}: {
  file: File;
  title?: string;
  /** A caption the receiving app may keep (WhatsApp does; Instagram ignores it). */
  text?: string;
}): Promise<ShareFileOutcome> {
  if (isNativePlatform()) {
    // A shell build that cannot share files, in a webview that cannot
    // download one: this is the honest answer rather than a silent no-op. The
    // caller says to update the app or use the browser.
    if (!shellSupports('shareFile')) return 'unsupported';
    try {
      // `text` does not travel. The app's share sheet takes a file OR text on
      // Android, not both, so a caption rides the clipboard instead; the share
      // sheet copies it before it calls this, on every path.
      const { outcome } = await request(
        'shareFile',
        {
          kind: 'base64',
          data: await blobToBase64(file),
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          title,
        },
        // Includes the time the share sheet sits open waiting on a person.
        { timeoutMs: 300_000 }
      );
      return outcome;
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
      console.error('[share] native file share failed', error);
      return 'unsupported';
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      // First await on this path, on purpose: see the header.
      await navigator.share({ files: [file], title, ...(text ? { text } : {}) });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
      // NotAllowedError (the tap's activation was spent) or a target that
      // refused the file. Saving it is still useful, so fall through.
      console.error('[share] web file share failed, saving instead', error);
    }
  }

  downloadBlob(file, file.name);
  return 'downloaded';
}

/**
 * Hand plain text to other apps: the native sheet, or the browser's. Returns
 * 'unsupported' when neither exists, so the caller can offer Copy instead of
 * a button that does nothing.
 */
export async function shareTextToApps({
  text,
  title,
}: {
  text: string;
  title?: string;
}): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (isNativePlatform()) {
    if (!shellSupports('shareText')) return 'unsupported';
    try {
      const { outcome } = await request('shareText', { text, title }, { timeoutMs: 300_000 });
      return outcome;
    } catch (error) {
      return isAbort(error) ? 'cancelled' : 'unsupported';
    }
  }
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unsupported';
  try {
    await navigator.share({ title, text });
    return 'shared';
  } catch (error) {
    return isAbort(error) ? 'cancelled' : 'unsupported';
  }
}

/** Whether a text-only share sheet exists here at all. */
export function canShareTextToApps(): boolean {
  if (isNativePlatform()) return shellSupports('shareText');
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Copy to the clipboard. Resolves false rather than throwing: the clipboard is
 * unavailable on an insecure origin and can be permission-denied, and a copy
 * that failed must be SAID, never assumed.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hand the user a generated TEXT file (a data export) whose bytes we already
 * hold, rather than a remote image URL.
 *
 * Different enough from shareOrDownloadImage to need its own entry point, for
 * one reason worth stating: an export is fetched from our own API with an
 * Authorization header, so there is no URL a browser or a system browser could
 * usefully be pointed at. The bytes arrive in memory and have to be saved from
 * there.
 *
 * The three paths mirror the image helper, and the middle one is the honest
 * failure this feature has to have:
 *
 *  1. Native with `shareFile` — the shell writes to its cache directory and
 *     opens the share sheet, so the file can go to Files, Drive or a mail.
 *  2. Native WITHOUT that capability. A webview cannot download and there is no
 *     URL to open, so this genuinely cannot save a file. It returns
 *     'unsupported' rather than pretending: the caller tells the user to use
 *     the web app. Silently doing nothing on a "get my data out" button would
 *     be the worst possible outcome for a trust feature.
 *  3. Web — a blob and an object URL, the only thing that actually saves.
 */
export type SaveTextOutcome = ShareOutcome | 'unsupported';

export async function shareOrDownloadTextFile({
  contents,
  fileName,
  mimeType,
  title,
}: {
  contents: string;
  fileName: string;
  mimeType: string;
  title?: string;
}): Promise<SaveTextOutcome> {
  const native = isNativePlatform();
  const canShareNatively = native && shellSupports('shareFile');

  if (canShareNatively) {
    try {
      const { outcome } = await request(
        'shareFile',
        { kind: 'text', data: contents, fileName, mimeType, title },
        { timeoutMs: 300_000 }
      );
      return outcome;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (CANCELLED_PATTERN.test(message)) return 'cancelled';
      console.error('[share] native export share failed', error);
      return 'unsupported';
    }
  }

  if (native) return 'unsupported';

  downloadBlob(new Blob([contents], { type: mimeType }), fileName);
  return 'downloaded';
}
