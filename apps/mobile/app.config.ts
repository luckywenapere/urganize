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
const PASTED_EAS_PROJECT_ID = 'a8a43eea-ad82-4288-a324-e301d906cf5a';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || PASTED_EAS_PROJECT_ID;

// The launch screen's ground: the site's dark ground, #0c0c0d (v1.157.7; it
// was #0d120e). Keep it equal to INK in src/OfflineScreen.tsx and to the
// site's --color-bg-base, or opening the app shows two load screens.
const INK = '#0c0c0d';
// The light theme's ground (--color-bg-base 245 240 230 in the site's globals.css).
const PAPER = '#f5f0e6';
const NOTIFICATION_ICON = './assets/notification-icon.png';
const NOTIFICATION_COLOR = '#7fd99a';

const config: ExpoConfig = {
  name: 'Urganize',
  slug: 'urganize',
  version: VERSION,
  // Unchanged from the Capacitor shell: Google sign-in returns here, and the
  // Supabase redirect allowlist already carries com.urganize.app://auth/callback.
  scheme: 'com.urganize.app',
  // Turns with the phone (founder, Oct 31, 2026); the page lays itself out
  // for the width it gets, and the safe area covers every edge (App.tsx).
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: INK,
  runtimeVersion: { policy: 'appVersion' },
  updates: EAS_PROJECT_ID ? { url: `https://u.expo.dev/${EAS_PROJECT_ID}` } : undefined,
  extra: EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : undefined,
  ios: {
    bundleIdentifier: 'com.urganize.app',
    // Sign in with Apple (Apple rule 4.8, since the site offers Google): turns on
    // the capability on the App ID and in the build's entitlements.
    usesAppleSignIn: true,
    // Phone only for now. Saying 'true' means Apple expects iPad screenshots and
    // an iPad layout that has been tested, and an iPad bug is a rejection.
    supportsTablet: false,
    googleServicesFile: hasIosFirebase ? IOS_FIREBASE_CONFIG : undefined,
    entitlements: { 'aps-environment': 'production' },
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
      // Voice input for UrgAns (NEXT_PUBLIC_FEATURE_URGANS_VOICE): iOS shows
      // this string when the webview first asks for the microphone.
      NSMicrophoneUsageDescription: 'Urganize uses the microphone so you can talk to AI.',
      // Choosing a file in the page (cover art, a song, a press photo) opens the
      // phone's own picker, which offers "Take Photo". Without this string the
      // app CRASHES the moment someone taps it, and Apple rejects an app that
      // does not explain why it wants the camera or photos.
      NSCameraUsageDescription: 'Urganize uses the camera so you can take a photo to add to a rollout, like cover art.',
      NSPhotoLibraryUsageDescription: 'Urganize uses your photos so you can pick artwork and images to add to a rollout.',
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
    // RECORD_AUDIO + MODIFY_AUDIO_SETTINGS: voice input for UrgAns
    // (NEXT_PUBLIC_FEATURE_URGANS_VOICE). The webview records a short clip via
    // getUserMedia; without the permission the mic hits NotAllowedError, which
    // the composer handles with a "Allow the microphone" message — so this is
    // only needed once the feature is switched on.
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
    ],
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
        // Follows the phone's light or dark setting: the cream mark on ink in
        // dark, the ink mark on the site's paper ground in light.
        image: './assets/icon-foreground-dark.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: PAPER,
        dark: {
          image: './assets/icon-foreground.png',
          backgroundColor: INK,
        },
      },
    ],
    'expo-web-browser',
    // Urganize in Android's share sheet (Bring your notes). Android only: iOS
    // needs a separate share extension target, which is its own build to test.
    // '*/*' because chat exports (.zip, .txt), voice notes (.opus), photos and
    // plain text all come this way; what the app cannot use is told so, not hidden.
    [
      'expo-share-intent',
      {
        disableIOS: true,
        androidIntentFilters: ['*/*'],
        androidMultiIntentFilters: ['*/*'],
      },
    ],
    'expo-apple-authentication',
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
        // React Native Firebase 26 resolves Firebase through Swift Package
        // Manager, which it refuses to combine with static linkage (the pod
        // install fails with duplicate symbols), so link dynamically.
        ios: { useFrameworks: 'dynamic' },
      },
    ],
  ],
};

export default config;
