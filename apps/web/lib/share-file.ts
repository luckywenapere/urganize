import { Capacitor } from '@capacitor/core';
import { openExternalUrl } from '@/lib/external-link';
import { isNativePlatform } from '@/lib/platform';

/**
 * Hand a generated image to the user: the native share sheet inside the app,
 * a normal download on the web.
 *
 * Three paths, in order of preference:
 *
 *  1. Native with the Share and Filesystem plugins present. The share sheet
 *     needs a local file URI, not a remote URL, so the bytes are written to the
 *     cache directory first.
 *  2. Native WITHOUT those plugins. Installed shells built before these plugins
 *     were added cannot share, and a webview cannot download, so the image goes
 *     to the system browser where it can be saved by long press. This is why
 *     the plugin presence is probed at runtime rather than assumed from the
 *     package.json.
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
  const canShareNatively =
    native && Capacitor.isPluginAvailable('Share') && Capacitor.isPluginAvailable('Filesystem');

  if (canShareNatively) {
    try {
      const [{ Share }, { Filesystem, Directory }] = await Promise.all([
        import('@capacitor/share'),
        import('@capacitor/filesystem'),
      ]);

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not fetch the image (${response.status}).`);
      const base64 = await blobToBase64(await response.blob());

      const written = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });

      await Share.share({ title, files: [written.uri] });
      return 'shared';
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

function hasNativeSharePlugins(): boolean {
  return Capacitor.isPluginAvailable('Share') && Capacitor.isPluginAvailable('Filesystem');
}

/**
 * Can this device hand a file to other apps? True inside the app with the
 * share plugins, and in a TOUCH browser whose share sheet accepts files.
 *
 * Desktop browsers implement the same API, but the menu they open (AirDrop,
 * Mail, a Windows share panel) has no Instagram and no WhatsApp status in it,
 * so a computer saves the file instead, which is the thing people can use.
 * `pointer: coarse` rather than a width, so a landscape iPad still shares.
 */
export function canShareFilesToApps(file: File): boolean {
  if (isNativePlatform()) return hasNativeSharePlugins();
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
    // An installed shell built before these plugins cannot share a file, and a
    // webview cannot download one, so this is the honest answer rather than a
    // silent no-op. The caller says to update the app or use the browser.
    if (!hasNativeSharePlugins()) return 'unsupported';
    try {
      const [{ Share }, { Filesystem, Directory }] = await Promise.all([
        import('@capacitor/share'),
        import('@capacitor/filesystem'),
      ]);
      const written = await Filesystem.writeFile({
        path: file.name,
        data: await blobToBase64(file),
        directory: Directory.Cache,
      });
      await Share.share({ title, text, files: [written.uri], dialogTitle: title });
      return 'shared';
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
    if (!Capacitor.isPluginAvailable('Share')) return 'unsupported';
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: title });
      return 'shared';
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
  if (isNativePlatform()) return Capacitor.isPluginAvailable('Share');
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
 *  1. Native with Share and Filesystem present — write to the cache directory
 *     and open the share sheet, so the file can go to Files, Drive or a mail.
 *  2. Native WITHOUT those plugins. A webview cannot download and there is no
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
  const canShareNatively =
    native && Capacitor.isPluginAvailable('Share') && Capacitor.isPluginAvailable('Filesystem');

  if (canShareNatively) {
    try {
      const [{ Share }, { Filesystem, Directory, Encoding }] = await Promise.all([
        import('@capacitor/share'),
        import('@capacitor/filesystem'),
      ]);

      const written = await Filesystem.writeFile({
        path: fileName,
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({ title, files: [written.uri] });
      return 'shared';
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
