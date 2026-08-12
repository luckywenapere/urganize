# Mobile push notification setup — manual steps

These are one-time, project-specific configuration changes you make in the **Firebase Console** (and, later, the **Apple Developer** portal) for the native apps to receive push notifications. None of this is code — it's console/dashboard config the code changes can't fill in for you. Values you need to look up or decide are marked **[FILL IN]**.

Background: Web Push (`apps/web/lib/push-server.ts`, `public/sw.js`) already reaches browsers and installed PWAs, but the Capacitor native shell has no `PushManager` — neither the Android WebView nor iOS WKWebView expose one — so it silently gets nothing today. This adds a second transport, FCM (Firebase Cloud Messaging) HTTP v1, that both platforms route through: Android talks to FCM directly, iOS talks to FCM which relays to APNs on your behalf (so you still need an APNs key in Firebase for iOS — see part 3). The server fans out to both transports from one choke point (`sendPushToUsers` / `sendPushToAllUsers` in `lib/push-server.ts`), so nothing above that layer needs to know which transport a given device uses.

**Android can ship without any of the iOS steps.** Part 1 + 2 alone unblock Android; part 3 is the Apple-side work and is explicitly deferred until you're ready to do it.

## 1. Firebase Console → create the project + register the Android app

Go to **[FILL IN: https://console.firebase.google.com/]** → Add project (or reuse an existing one if the founder already has a Firebase project for something else).

Add an Android app to the project:
- **Android package name**: `com.urganize.app` (from `apps/mobile/capacitor.config.ts`'s `appId` — must match exactly).
- Download the generated **`google-services.json`**.

Place that file at:

```
apps/mobile/android/app/google-services.json
```

This is **not a secret** — it's client-side config (project id, app id, a public API key scoped to this Android package) — so it gets **committed to the repo**, the same way `apps/mobile/android/app/build.gradle`'s conditional apply block already expects:

```gradle
try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
```

Once the file exists, that block picks it up automatically on the next Gradle build — no other Android-side change is needed. `apps/mobile/android/build.gradle` already carries the `com.google.gms:google-services` classpath.

## 2. Firebase Console → generate a service-account key for the SERVER side

The server sends pushes via FCM's HTTP v1 API, which authenticates with a service-account key, not the `google-services.json` above (that file is for the *client* app to register with Firebase — it grants no send permission).

Firebase Console → **Project settings → Service accounts → Generate new private key**. This downloads a JSON file containing `project_id`, `client_email`, and `private_key`.

Paste the **entire contents of that file, as one line**, into the Vercel `Web` project's Production environment as:

```
FCM_SERVICE_ACCOUNT_JSON=<the full JSON>
```

Server-only — never expose this to the client bundle (it is deliberately **not** in `turbo.json`'s env allowlist, same as `CRON_SECRET`). See `apps/web/lib/fcm-server.ts` for how it's used: a short-lived OAuth token is signed from the private key and exchanged for an access token before each send, cached until shortly before it expires.

Once both this and the Android app registration (part 1) are done, and `NEXT_PUBLIC_FEATURE_NATIVE_PUSH=true` is set, Android push is live — no further steps needed for that platform.

## 3. iOS — blocked on the founder's Apple Developer setup

This part needs an active Apple Developer account and access to Xcode (a Mac), neither of which the coding side of this project has. The native code (`apps/mobile/ios/App/App/AppDelegate.swift`'s `didRegisterForRemoteNotificationsWithDeviceToken` / `didFailToRegisterForRemoteNotificationsWithError` callbacks) is already in place and inert until these steps happen.

1. **Apple Developer portal** → Certificates, Identifiers & Profiles → Keys → create an **APNs Auth Key** (the modern, non-expiring alternative to a push certificate). Note its Key ID and download the `.p8` file — Apple only lets you download it once.
2. **Firebase Console** → the same project as above → add an **iOS app** with bundle ID `com.urganize.app` → download its `GoogleService-Info.plist` (do **not** commit this the way `google-services.json` was committed above — confirm with a fresh audit whether it needs the same "not a secret" treatment before committing; if in doubt, keep it out of git and have Codemagic inject it, since unlike the Android file this one hasn't been reviewed for that yet).
3. Firebase Console → Project settings → Cloud Messaging → **Apple app configuration** → upload the `.p8` key from step 1, its Key ID, and your Apple Team ID. This is what lets FCM relay iOS pushes through APNs on your behalf — you do not talk to APNs directly.
4. **Xcode** (on a Mac, or via a one-off Codemagic build) → open `apps/mobile/ios/App/App.xcworkspace` → target `App` → **Signing & Capabilities** → **+ Capability** → **Push Notifications**. This writes an `App.entitlements` file (doesn't exist yet) and adds the `aps-environment` entitlement Xcode needs to sign a build that can register for remote notifications.
5. **Apple Developer portal** → your App ID (`com.urganize.app`) → confirm the **Push Notifications** capability shows as enabled (Xcode usually does this for you in step 4, but Codemagic's CI signing (`docs/mobile/codemagic-setup.md`) needs the App ID's capability list and the provisioning profile it fetches via `xcode-project use-profiles` to already include it — a build can fail to sign on CI even though it built fine once locally in Xcode, if this wasn't picked up yet).
6. Run `pnpm mobile:ios-ci` (`cap sync ios`) locally or let the Codemagic pipeline do it — this also finally runs `pod install` for the plugins pods that were stale before this feature (Filesystem, Share, and now PushNotifications).

Nothing above changes any TypeScript — the client bridge (`components/providers/CapacitorPushBridge.tsx`, `lib/native-push.ts`) and the server sender already handle iOS the same way as Android once a device can actually register.

## 4. What to test once Android is live

1. In Settings, tap "Turn on notifications" — the OS permission prompt should appear (Android 13+; earlier Android versions grant automatically per the plugin's own docs).
2. In `/admin/notifications`, use "Send test to me" — a system-tray notification should appear on the device within a few seconds.
3. Tap the notification — the app should open (or come to the foreground) and navigate to the notification's target page.
4. If nothing arrives: check Vercel's function logs for `[fcm]`-prefixed errors first (`fcm-server.ts` logs failures instead of throwing), then confirm `google-services.json` is committed and `FCM_SERVICE_ACCOUNT_JSON` is actually set in the Production environment (not just Preview).
