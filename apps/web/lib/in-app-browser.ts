/**
 * In-app browsers (#1380). Instagram, TikTok, Snapchat, Facebook, LinkedIn and
 * the like open links in an embedded webview. Google refuses OAuth there
 * (Error 403 disallowed_useragent), so "Continue with Google" cannot work and
 * the visitor is stuck. Pure functions only: the user agent goes in, an answer
 * comes out. The React side is components/auth/GoogleGate.tsx.
 *
 * Our own Expo shell is NOT an in-app browser for this purpose; callers must
 * check it first (see isInAppBrowserNow in the component).
 */

const NAMED_APPS: ReadonlyArray<readonly [name: string, pattern: RegExp]> = [
  ['Instagram', /Instagram/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS|FBSS/],
  ['Threads', /Barcelona/],
  ['TikTok', /musical_ly|TikTok|BytedanceWebview|Bytedance|trill_/i],
  ['Snapchat', /Snapchat/i],
  ['LinkedIn', /LinkedInApp/i],
  ['X', /Twitter/i],
  ['WhatsApp', /WhatsApp/i],
  ['Line', /\bLine\//],
  ['WeChat', /MicroMessenger/],
  ['Google app', /\bGSA\//],
];

export type InAppBrowser = { name: string };

/** Which in-app browser this user agent is, or null for a normal browser. */
export function detectInAppBrowser(userAgent: string | undefined | null): InAppBrowser | null {
  const ua = (userAgent ?? '').trim();
  if (!ua) return null;
  for (const [name, pattern] of NAMED_APPS) {
    if (pattern.test(ua)) return { name };
  }
  // Android System WebView: "; wv)" in the platform part.
  if (/Android/i.test(ua) && /;\s*wv\)/.test(ua)) return { name: 'this app' };
  // iOS webview: a phone WebKit with no "Safari/" token. Safari, Chrome, Firefox
  // and Edge on iOS all carry it.
  if (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && /Mobile\//.test(ua) && !/Safari\//.test(ua)) {
    return { name: 'this app' };
  }
  return null;
}

/**
 * Android only: a link that asks Chrome to open the same page. Returns null for
 * anything that is not an http(s) URL. The fallback sends the visitor to the
 * same address if Chrome is missing.
 */
export function buildChromeIntentUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const scheme = url.protocol.slice(0, -1);
  const rest = `${url.host}${url.pathname}${url.search}`;
  return `intent://${rest}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.toString())};end`;
}

export function isAndroidUserAgent(userAgent: string | undefined | null): boolean {
  return /Android/i.test(userAgent ?? '');
}
