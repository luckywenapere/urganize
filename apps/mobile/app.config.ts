import type { ExpoConfig } from 'expo/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pkg from './package.json';

// The shell's version tracks the product ledger (packages/changelog), which
// every package.json mirrors — so it is read from package.json rather than
// becoming another hand-kept number. Build numbers are EAS's job
// (eas.json: appVersionSource "remote" + autoIncrement).
const VERSION = pkg.version;

// Firebase's iOS config. Not committed yet: the founder adds the iOS app in
// Firebase and drops GoogleService-Info.plist next to this file (see
// docs/mobile/push-setup.md). Until then an iOS build FAILS at prebuild —
// React Native Firebase's plugin throws without it (its
// plugin/build/ios/googleServicesPlist.js) — while Android builds as normal,
// because that check runs only when preparing iOS.
const IOS_FIREBASE_CONFIG = './GoogleService-Info.plist';
const hasIosFirebase = existsSync(resolve(__dirname, IOS_FIREBASE_CONFIG));

// The EAS project id. `eas init` prints it (it cannot write into a dynamic
// config like this one) — paste it between the quotes once. It is not a
// secret. Empty means no OTA updates and no EAS builds yet; everything else,
// including a local build, still works. The environment variable is only an
// override for trying a second EAS project.
const PASTED_EAS_PROJECT_ID = '';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || PASTED_EAS_PROJECT_ID;

const INK = '#0d120e';
const NOTIFICATION_ICON = './assets/notification-icon.png';
const NOTIFICATION_COLOR = '#7fd99a';

const config: ExpoConfig = {
  name: 'Urganize',
  slug: 'urganize',
  version: VERSION,
  // Unchanged from the Capacitor shell: Google sign-in returns here, and the
  // Supabase redirect allowlist already carries com.urganize.app://auth/callback.
  scheme: 'com.urganize.app',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: INK,
  runtimeVersion: { policy: 'appVersion' },
  updates: EAS_PROJECT_ID ? { url: `https://u.expo.dev/${EAS_PROJECT_ID}` } : undefined,
  extra: EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : undefined,
  ios: {
    bundleIdentifier: 'com.urganize.app',
    supportsTablet: true,
    googleServicesFile: hasIosFirebase ? IOS_FIREBASE_CONFIG : undefined,
    entitlements: { 'aps-environment': 'production' },
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
      // No WKAppBoundDomains, deliberately. It is what lets a service worker
      // run in an iOS webview, and nothing needs one there today: Web Push
      // cannot reach a webview at all, and the site's offline layer
      // (NEXT_PUBLIC_FEATURE_OFFLINE) is switched off. It also narrows what
      // the webview may load and run, on a platform nobody can test from the
      // code side. Add it back with limitsNavigationsToAppBoundDomains in
      // App.tsx if the offline layer is switched on and wanted in the app.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.urganize.app',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/icon-foreground.png',
      backgroundImage: './assets/icon-background.png',
      backgroundColor: INK,
    },
    permissions: ['android.permission.POST_NOTIFICATIONS'],
    // Expo adds these by default and this app uses none of them: the page's
    // file picker hands over files without a storage permission, downloads go
    // through the share sheet (src/share.ts), and nothing draws over other
    // apps. Each one listed is one more line on the Play Store's data safety
    // form, so they are removed rather than left to explain.
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        image: './assets/icon-foreground.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: INK,
      },
    ],
    'expo-web-browser',
    'expo-updates',
    '@react-native-firebase/app',
    [
      '@react-native-firebase/messaging',
      {
        // Android draws the notification icon from its alpha channel only; the
        // mark is white on transparent, tinted spring green in the tray.
        android: { notificationIcon: NOTIFICATION_ICON, notificationColor: NOTIFICATION_COLOR },
      },
    ],
    // Creates the two resources the messaging plugin points at.
    ['./plugins/withNotificationIcon', { icon: NOTIFICATION_ICON, color: NOTIFICATION_COLOR }],
    [
      'expo-build-properties',
      {
        // React Native Firebase needs static frameworks on iOS.
        ios: { useFrameworks: 'static' },
      },
    ],
  ],
};

export default config;
