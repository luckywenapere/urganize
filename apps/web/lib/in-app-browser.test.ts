import { describe, expect, it } from 'vitest';
import { buildChromeIntentUrl, detectInAppBrowser, isAndroidUserAgent } from './in-app-browser';

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IOS_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('detectInAppBrowser', () => {
  it('leaves normal browsers alone', () => {
    for (const ua of [IOS_SAFARI, IOS_CHROME, ANDROID_CHROME, DESKTOP, '', undefined, null]) {
      expect(detectInAppBrowser(ua)).toBeNull();
    }
  });

  it.each([
    ['Instagram', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 330.0.0.0'],
    ['Facebook', 'Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0]'],
    ['Facebook', 'Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]'],
    ['TikTok', 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/110 Mobile Safari/537.36 musical_ly_2022'],
    ['TikTok', 'Mozilla/5.0 (iPhone) Mobile/15E148 BytedanceWebview/d8a21c6'],
    ['Snapchat', 'Mozilla/5.0 (iPhone) Mobile/15E148 Snapchat/12.0.0'],
    ['LinkedIn', 'Mozilla/5.0 (iPhone) Mobile/15E148 LinkedInApp/9.0'],
    ['X', 'Mozilla/5.0 (iPhone) Mobile/15E148 Twitter for iPhone'],
    ['WhatsApp', 'WhatsApp/2.23 Mozilla/5.0 (Linux; Android 13)'],
    ['Line', 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36 Line/13.0.0'],
    ['Google app', 'Mozilla/5.0 (iPhone) Mobile/15E148 GSA/300.0 Safari/604.1'],
    ['Threads', 'Mozilla/5.0 (iPhone) Mobile/15E148 Barcelona 300.0'],
  ])('spots %s', (name, ua) => {
    expect(detectInAppBrowser(ua)?.name).toBe(name);
  });

  it('spots an Android webview by the wv token', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120 Mobile Safari/537.36';
    expect(detectInAppBrowser(ua)).not.toBeNull();
  });

  it('spots an iOS webview with no Safari token, but not Safari or Chrome on iOS', () => {
    const webview = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
    expect(detectInAppBrowser(webview)).not.toBeNull();
    expect(detectInAppBrowser(IOS_SAFARI)).toBeNull();
    expect(detectInAppBrowser(IOS_CHROME)).toBeNull();
  });
});

describe('buildChromeIntentUrl', () => {
  it('keeps path and query and falls back to the same page', () => {
    const out = buildChromeIntentUrl('https://urganize.app/onboarding?ref=ig#top');
    expect(out).toBe(
      'intent://urganize.app/onboarding?ref=ig#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' +
        encodeURIComponent('https://urganize.app/onboarding?ref=ig#top') +
        ';end',
    );
  });
  it('refuses anything that is not http(s)', () => {
    expect(buildChromeIntentUrl('javascript:alert(1)')).toBeNull();
    expect(buildChromeIntentUrl('not a url')).toBeNull();
  });
});

describe('isAndroidUserAgent', () => {
  it('is true only for Android', () => {
    expect(isAndroidUserAgent(ANDROID_CHROME)).toBe(true);
    expect(isAndroidUserAgent(IOS_SAFARI)).toBe(false);
  });
});
