import { isNativePlatform } from '@/lib/platform';
import { request } from '@/lib/native-bridge';

/**
 * Opens a URL outside the app's own webview. Inside the native shell,
 * `target="_blank"`/`window.open` can silently no-op or open blank — there is
 * no "new tab" concept in a native webview — so the shell opens it in the
 * system browser instead (SFSafariViewController on iOS, Chrome Custom Tabs on
 * Android). On the regular web, this is just `window.open` in a new tab.
 *
 * If the shell cannot be reached (an old build, a dropped message), fall back
 * to navigating this webview: the shell sends any off-site navigation to the
 * system browser on its own, so the link still opens rather than doing nothing.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNativePlatform()) {
    try {
      await request('openExternal', { url });
    } catch (error) {
      console.error('[external-link] shell could not open the link, navigating instead', error);
      window.location.href = url;
    }
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
