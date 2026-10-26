# The Expo shell

`apps/mobile` is an Expo app for iOS and Android (`com.urganize.app`). It shows the live, continuously deployed web app, `https://app.urganize.app`, in a `react-native-webview`, and does the few things a web page cannot do on its own. It replaced the Capacitor shell on 2026-09-25. The Capacitor app never reached a store, but its APK (version 0.41.2, signed with the Urganize key) has been on urganize.app/download since 2026-08-08, and the install card has offered it to Android visitors since 2026-09-02 (v1.18.0). So real phones have it, and moving them over is its own step: see "Switching people from the old app" below.

## Why a shell, not a rebuild

The web app has 56 pages, about 190 screen components and 48+ API routes that need a live server (auth, Supabase admin, AI, Paystack webhooks). A static export is impossible, and a full native rewrite would mean two codebases to keep in step. So the shell keeps the property the Capacitor one had: **every web change reaches phones the moment it deploys, with no store review.** Only changes to the shell itself (new native modules, permissions, icons) need a store build, and changes to the shell's own JavaScript can go out as an EAS Update (over the air).

Why Expo over Capacitor: EAS builds iOS without a Mac and handles store uploads (this replaced Codemagic and Android Studio), EAS Update ships shell fixes without review, and the shell can grow native screens later if a surface earns one.

## How the website and the shell talk

The only place the website reads or calls the shell is `apps/web/lib/native-bridge.ts`. These website modules sit on top of it, and every other caller goes through them, so none of the rest know the shell exists:

| Website module | What it asks the shell for |
|---|---|
| `lib/platform.ts` | Nothing. It reads the injected shell info synchronously. |
| `lib/external-link.ts` | `openExternal` |
| `lib/auth-store.ts` (`loginWithGoogle`) | `oauth` |
| `lib/native-push.ts` | `push.permission`, `push.request`, `push.register` |
| `lib/share-file.ts` | `shareFile`, `shareText` |
| `components/providers/NativePushBridge.tsx` | Listens for the `pushTap` and `pushToken` events |
| `components/providers/NativeAppearanceBridge.tsx` | `appearance` (the page's ground colour, see below) |
| `components/providers/NativeShareBridge.tsx` | Listens for `shareReceived`, then asks `share.readFile` and `share.done` (Android share sheet, see below) |

The protocol lives in `packages/native-bridge`, which both apps import so the two halves cannot drift. Its tests are in `apps/web/lib/native-bridge.test.ts`, with the share paths in `share-file.test.ts` and the colour reading in `native-appearance.test.ts`. There are three channels:

1. **Shell info, synchronous.** The shell sets `window.__URGANIZE_NATIVE__ = { platform, shellVersion, protocol, capabilities }` before the page's scripts run (`injectedJavaScriptBeforeContentLoaded`). With no such global (every browser, and the server), the site behaves exactly as a website.
2. **Requests, page to native.** The page posts `{ v, id, type, payload }`. The shell answers with a response carrying the same `id`, delivered by `injectJavaScript` into `window.__urganizeBridgeReceive`. Every request has a timeout, and a request the shell has no handler for gets an error back instead of an exception.
3. **Events, native to page.** These are `pushTap {url}` and `pushToken {token}`. The shell holds them until the page sends `ready`, because a notification tapped while the app was closed arrives before the site has loaded.

**Capabilities, not versions.** The shell lists the request types it understands. If a page asks an older shell for something it cannot do, it gets `UnsupportedRequestError` immediately instead of waiting for a timeout. To add a request type: add it to `BRIDGE_REQUEST_TYPES` and `BridgeRequestMap` in the package, add the handler in `App.tsx` (the `BridgeHandlers` type makes a missing one a compile error), and check `shellSupports()` on the web side before asking.

**Only our own pages can drive native code.** The shell ignores any message whose page URL is not `https://*.urganize.app` (`isFirstPartyUrl`). Any top-level navigation off those hosts (Paystack, Supabase Storage, wa.me, mailto:) goes to the system browser or the app that owns it, never into the webview. A notification or a pushed link may only move the page to a path on our own site (`isSameOriginPath`), and `//host` and `/\host` do not count as one.

**Android injects late, sometimes.** iOS runs the shell info script at document start, before any page script, every time. Android runs it when the page starts loading, which is usually but not strictly before the page's first script. Two things cover the gap:

- The shell adds `UrganizeApp/<version>` to the webview's user agent, and `isAndroidBrowser()` / `isIOSBrowser()` refuse to call the app a phone browser when they see it. Without that, the app could offer to install itself.
- `whenInShell()` in `lib/native-bridge.ts` runs code once the shell info arrives, checking for a few seconds when the page can post to a webview host but has not been described yet. `NativePushBridge` starts through it, because subscribing is what tells the shell the page is ready for a notification that opened the app.

## iOS: no payment links

Apple does not allow an iOS app to sell a digital subscription through anything but its own in-app purchase, or to link out to a checkout. So inside the iOS app every surface that sells a plan shows a "manage your subscription on the web" line instead of prices and a Subscribe button. It reads `isIOSApp()` after mount, so the server's HTML and the first client render still match:

| Surface | File |
|---|---|
| The team wall and plan picker | `apps/web/components/billing/TeamWall.tsx` |
| The legacy plan picker at `/locked` | `apps/web/app/locked/LockedPageClient.tsx` |
| The card trial page (retired, flag off) | `apps/web/app/start-trial/StartTrialPageClient.tsx` |

The free trial and promo codes stay visible, because neither sells anything. Android has no such rule: checkout opens Paystack in the system browser there, through `openExternalUrl`. Any new surface that sells a plan needs the same `isIOSApp()` branch.

## Notes on specific pieces

- **Push uses React Native Firebase, not expo-notifications.** The server sends only through FCM HTTP v1 (`apps/web/lib/fcm-server.ts`). Expo's device token on iOS is a raw APNs token, which FCM refuses. RN Firebase gives an FCM token on both platforms, so the server did not change. The Android notification icon is written by `apps/mobile/plugins/withNotificationIcon.js`, because the RN Firebase plugin only points at it.
- **Google sign-in:** the shell runs `WebBrowser.openAuthSessionAsync` with the Supabase authorize URL and hands the `com.urganize.app://auth/callback…` redirect back to the page. The page rewrites it to `/auth/callback…` and navigates, so the existing callback page does the code exchange. The PKCE verifier it needs is in the webview's own storage. See `auth-setup.md`.
- **Sharing a file:** for an image, the page fetches the bytes itself, because it holds the session a signed URL was minted for. It sends them as base64, and the shell writes them to its cache folder under a cleaned-up name (`safeShareFileName`) and opens the share sheet (`expo-file-system`, `expo-sharing`). A caption does not travel with the file, because Android's share sheet takes a file or text, not both. The share-to-socials sheet copies the caption to the clipboard before it shares, on every path, so it is one paste away.
- **Receiving a share (Android, v1.184.0):** Urganize is in the share sheet for Bring your notes. `expo-share-intent` (config plugin in `app.config.ts`, `disableIOS: true`, filters `*/*`) adds `SEND` and `SEND_MULTIPLE` intent filters and keeps the main activity `singleTask`, so a share while the app is open reaches the running app. `src/shareIntent.ts` holds the files and the shell emits `shareReceived {id, text, title, files}` (held until the page is ready). The page pulls each file with `share.readFile` in base64 chunks of `SHARE_CHUNK_CHARS` (a chat export can be several MB, too big for one injected script), writes it into the same Cache API store the installed web app's service worker uses (`urganize-share-v1`), says `share.done`, and goes to `/dashboard/notes?import=share&share=<id>`. Needs a new store build, not an OTA update: it adds a native module and a manifest change. iOS would need a share extension target and is not done.
- **Sharing text** (the message to DM) goes through React Native's own `Share`, which needs no extra native module.
- **Keyboard:** Android draws the app edge to edge, so the keyboard covers the page instead of shrinking it. A `KeyboardAvoidingView` shrinks the webview by the keyboard's height on Android only, so a message box at the bottom of the screen (UrgAns) stays above the keyboard. iOS moves the page itself.
- **Bar colours:** the page tells the shell its ground colour through `appearance`, read from the `--color-bg-base` design token, and again whenever the theme changes. The shell paints the bands above and below the webview that colour and picks light or dark status bar text to match. Before the page reports, they are the brand ink, which is also the splash and the default theme.
- **Offline:** if the first load fails, a native "You're offline" screen replaces the webview's error page. It retries on its own when the connection comes back (`shouldRetryAfterReconnect`), and only then: a load that failed while online does not reload in a loop.
- **A page that dies in the background** (the OS kills the webview's process to reclaim memory) is reloaded at once instead of leaving a blank screen: `onContentProcessDidTerminate` on iOS, `onRenderProcessGone` on Android.
- **The splash** stays until the first page finishes loading, for at most 8 seconds.
- **No app-bound domains on iOS.** They are what lets a service worker run in an iOS webview, and nothing needs one there today: Web Push cannot reach a webview, and the site's offline layer (`NEXT_PUBLIC_FEATURE_OFFLINE`) is switched off. They also narrow what the webview may load and run. If the offline layer is switched on and wanted in the app, add `WKAppBoundDomains` in `app.config.ts` and `limitsNavigationsToAppBoundDomains` in `App.tsx` together, and test the bridge on a real iPhone first.
- **Android back button** walks the webview's history first, and leaves the app only from the first page.
- **Permissions:** the only permission the app ever asks for is notifications. The others in its manifest (internet, network and wifi state, wake lock, vibrate, and Firebase's message receiver) are granted at install with no prompt. Expo's defaults for storage and drawing over other apps are removed in `app.config.ts` (`blockedPermissions`), because nothing uses them. Checked in the built APK's manifest, 2026-09-25.
- **Native projects are generated, not committed.** `apps/mobile/android` and `apps/mobile/ios` are built from `app.config.ts` by `expo prebuild` and are gitignored. Change `app.config.ts` or a config plugin, never the generated folders.

## Building on Windows

EAS builds in the cloud and is the normal way to build (`eas-setup.md`). A local Android build on Windows also works, with one catch: Windows limits file paths to 260 characters unless long paths are turned on, and the build creates paths deep inside `node_modules`. From a deep folder (a git worktree under `.claude/worktrees`, say) the build fails with `CreateProcess error=2` on a `prefab_command.bat`. Either turn on long paths in Windows (a system setting: `LongPathsEnabled` in the registry, then restart), or copy the repo to a short folder such as `C:\Users\<you>\ub` without `node_modules`, then:

```bash
pnpm install --frozen-lockfile
```
```bash
pnpm --filter @urganize/mobile exec expo prebuild --platform android
```

and, from `apps/mobile/android`, with `JAVA_HOME` pointing at Android Studio's `jbr` folder:

```bash
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 "-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1024m"
```

The memory setting matters on Windows: when Gradle cannot reach its Kotlin compiler daemon it compiles inside its own process instead, and the generated default (512 MB of class space) runs out with `OutOfMemoryError: Metaspace`. If the path limit bites even from a short folder (ninja reporting `build.ninja still dirty after 100 tries`), add `node-linker=hoisted` to that copy's `.npmrc` only and install again: the flat layout makes every package path about 80 characters shorter. EAS builds on Linux and needs none of this.

The APK lands in `apps/mobile/android/app/build/outputs/apk/release/`. It is signed with React Native's public test key, not the Urganize key, so it is for your own phone only: remove the old Urganize app first (a different key cannot install over it), and never put it on urganize.app/download (`android-signing.md` says why).

## Switching people from the old app

The APK on urganize.app/download is the Capacitor app, and the new website half cannot talk to it. Once this change is live, the old app still opens and signs in with email, and it never offers to install itself (`isRetiredCapacitorApp` in `lib/platform.ts`), but "Continue with Google" finishes in the phone's browser instead of the app. (It never had notifications or a share sheet: that build predates both.) So swap the download in the same release:

1. Save the key's passwords and give the key to EAS (`android-signing.md`).
2. Build a preview APK with EAS. It is signed with the same key, so it installs over the old app.
3. Ship the website half and put the new APK at `apps/homepage/public/downloads/urganize.apk` together, updating `APP_VERSION` and `APK_SIZE` on the download page (`eas-setup.md`).
4. Run the checklist below on a phone.

Anyone who already has the old app just downloads the new one again from the same link.

## Known limits

- Android does not show a notification while the app is in the foreground. The Capacitor shell had the same limit. iOS shows a banner, configured in `apps/mobile/firebase.json`.
- A caption does not travel with a shared file (see Sharing a file above); it rides the clipboard.
- Pull-to-refresh is off on purpose: the app's pages scroll inside panels, so a pull at the top of the document would reload the page while you are scrolling a list.
- Nothing about iOS has run: it needs the Firebase and Apple steps in `push-setup.md` and an EAS build before there is an app to try.

## Manual test checklist

Run this on a real phone with a new build, Android first, once the website half is live. Before that, the live site does not know the new app: Google sign-in, notifications, sharing and the bar colours cannot work in it, and the site may offer "Get the app" inside it. What you can check early is that it opens with no browser bars, email sign-in, the keyboard (step 4), the back button, and the offline screen (step 8).

1. **Opens.** The splash shows, then the app. No browser bars, no "Get the app" banner inside the app.
2. **Signs in with email** and **with Google**: Google opens a sheet on its real consent screen, and approving returns you to the app signed in. Closing the sheet leaves the sign-in button usable.
3. **Light and dark.** Switch the theme in Settings → Appearance. The bands above and below the page follow it, and the status bar text stays readable.
4. **Keyboard.** Open UrgAns and tap the message box. It stays above the keyboard while you type.
5. **Links.** A Paystack checkout, a wa.me link and an email link each open outside the app. Android's back button goes back a page, and leaves the app only from the first one.
6. **Push.** In Settings, turn on notifications and accept the prompt. Send a test from `/admin/notifications`, and tap it with the app in the background and again with it closed: both open the page it points to.
7. **Sharing.** Share a rollout post to Instagram and a status to WhatsApp from the share sheet, share the DM message, download a recap image, and export your data. Each opens the phone's share sheet.
8. **Offline.** Turn on airplane mode and open the app cold: the offline screen shows. Turn airplane mode off: it loads on its own.
9. **iPhone only:** the plan picker shows the "manage on the web" line, not prices.
