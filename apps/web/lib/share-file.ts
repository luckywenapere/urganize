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
