import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Remote-URL strategy (decided in docs/mobile/capacitor-audit.md, section 2):
 * apps/web ships 48 API routes, a Paystack webhook, and server-held Supabase
 * admin credentials — none of that can become a static export. The native
 * shell loads the real, continuously-deployed production app instead of
 * bundling a build of its own. `webDir` still points at a local placeholder
 * (`www/`) because Capacitor requires one to exist for `cap sync`/`cap copy`;
 * it is never shown once `server.url` takes over navigation, except as a
 * brief flash before the first remote load on a cold start.
 */
const config: CapacitorConfig = {
  appId: 'com.urganize.app',
  appName: 'Urganize',
  webDir: 'www',
  server: {
    url: 'https://app.urganize.app',
    // HTTPS only — the production origin never serves plain HTTP.
    cleartext: false,
    // Scoped to our own domains only. Anything else (Google's OAuth consent
    // screen, Paystack's checkout page) is opened via @capacitor/browser in
    // the system browser, NOT navigated to inside this webview — so it does
    // not need an entry here. Widening this list defeats the point of an
    // allowlist; add a domain only when a specific in-webview navigation
    // needs it.
    allowNavigation: ['app.urganize.app', 'urganize.app', 'www.urganize.app', '*.urganize.app'],
  },
  ios: {
    // Apple review process is comparatively slow; keep contentInset sane and
    // let the web app's own safe-area CSS (see globals.css) own layout.
    contentInset: 'automatic',
  },
  android: {
    // Match the app's own dark-mode-first behavior instead of a stock white
    // native splash flash.
    backgroundColor: '#0d120e',
  },
  plugins: {
    // Foreground presentation for push notifications (docs/mobile/push-setup.md).
    // iOS-only in effect — Android always shows a system-tray notification
    // when the app is backgrounded and has no equivalent foreground option
    // here, but the config key is harmless to set on both platforms.
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
