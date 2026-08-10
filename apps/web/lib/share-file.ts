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
