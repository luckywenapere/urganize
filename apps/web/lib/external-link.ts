import { Browser } from '@capacitor/browser';
import { isNativePlatform } from '@/lib/platform';

/**
 * Opens a URL outside the app's own webview. Inside the Capacitor shell,
 * `target="_blank"`/`window.open` can silently no-op or open blank — there is
 * no "new tab" concept in a native webview — so we route through
 * @capacitor/browser's system browser (SFSafariViewController on iOS, Chrome
 * Custom Tabs on Android) instead. On the regular web, this is just
 * `window.open` in a new tab, matching existing behavior exactly.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
