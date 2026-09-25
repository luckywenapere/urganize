# Mobile push notification setup — manual steps

These are one-time, project-specific configuration changes you make in the **Firebase Console** (and, later, the **Apple Developer** portal) for the native apps to receive push notifications. None of this is code — it's console/dashboard config the code changes can't fill in for you. Values you need to look up or decide are marked **[FILL IN]**.

Background: Web Push (`apps/web/lib/push-server.ts`, `public/sw-push.js`) reaches browsers and installed PWAs, but an app webview has no `PushManager`. So the app uses a second transport, FCM (Firebase Cloud Messaging) HTTP v1, on both platforms. Android talks to FCM directly; on iOS, FCM relays to APNs for you, so iOS still needs an APNs key in Firebase (part 3). The Expo shell gets an FCM token on both platforms through React Native Firebase (`apps/mobile/src/push.ts`), which is why it does not use `expo-notifications`: Expo's iOS token is a raw APNs token that FCM refuses. The server fans out to both transports from one choke point (`sendPushToUsers` / `sendPushToAllUsers` in `lib/push-server.ts`), so nothing above that layer needs to know which transport a given device uses.

**Android can ship without any of the iOS steps.** Part 1 + 2 alone unblock Android; part 3 is the Apple-side work and is explicitly deferred until you're ready to do it.

## 1. Firebase Console → create the project + register the Android app — **DONE (2026-08-12)**

Done, and the values it produced are recorded here so nothing downstream has to go looking for them:

| | |
|---|---|
| Firebase project name | `urganize` |
| **Project ID** | **`urganize-2b082`** — the suffix is Firebase's, because plain `urganize` was already taken globally. This is the `project_id` that shows up in the service-account JSON and in the FCM v1 endpoint URL. |
| Project number | `776089505317` |
| Android app ID | `1:776089505317:android:e143bc33b176867e38f9cc` |
| Package name | `com.urganize.app` |
| Google Analytics | **not enabled** — deliberately skipped; the product already runs PostHog, and this project exists only to carry FCM. |
| SHA-1 fingerprint | **not set, and not needed.** FCM does not require one. It is only for Firebase Auth / Dynamic Links, and Google sign-in here goes through the system browser to Supabase, not Firebase. |

`apps/mobile/google-services.json` is committed (it moved from `android/app/` when the shell became an Expo app). It carries only client config (project/app ids plus a package-scoped API key) — no private key, no service-account material — which is why it belongs in git. `app.config.ts` (`android.googleServicesFile`) wires it into every generated build.

If the Firebase project is ever rebuilt: add an Android app with package name `com.urganize.app` and replace `apps/mobile/google-services.json` with the new download.

## 2. Firebase Console → generate a service-account key for the SERVER side

The server sends pushes via FCM's HTTP v1 API, which authenticates with a service-account key, not the `google-services.json` above (that file is for the *client* app to register with Firebase — it grants no send permission).

Firebase Console → **Project settings → Service accounts → Generate new private key**. This downloads a JSON file containing `project_id`, `client_email`, and `private_key`.

Paste the **entire contents of that file, as one line**, into the Vercel `Web` project's Production environment as:

```
FCM_SERVICE_ACCOUNT_JSON=<the full JSON>
```

Server-only — never expose this to the client bundle (it is deliberately **not** in `turbo.json`'s env allowlist, same as `CRON_SECRET`). See `apps/web/lib/fcm-server.ts` for how it's used: a short-lived OAuth token is signed from the private key and exchanged for an access token before each send, cached until shortly before it expires.

Once both this and the Android app registration (part 1) are done, and `NEXT_PUBLIC_FEATURE_NATIVE_PUSH=true` is set, Android push is live — no further steps needed for that platform.

## 3. iOS — needs your Apple Developer account

No Mac and no Xcode are needed any more: EAS builds iOS in the cloud (`eas-setup.md`), and the push entitlement and background mode are already declared in `apps/mobile/app.config.ts`.

1. **Apple Developer portal** → Certificates, Identifiers & Profiles → Keys → create an **APNs Auth Key**. Note its Key ID and download the `.p8` file; Apple only lets you download it once. Keep it out of the repo (`*.p8` is gitignored).
2. **Firebase Console** → project `urganize-2b082` → add an **iOS app** with bundle ID `com.urganize.app` → download `GoogleService-Info.plist` and put it at `apps/mobile/GoogleService-Info.plist`. It is client config like `google-services.json` (ids and a bundle-scoped API key, no private key), so commit it. `app.config.ts` picks it up automatically when the file exists. **Until it exists, iOS builds fail at prebuild**, because the Firebase plugin requires it.
3. **Firebase Console** → Project settings → Cloud Messaging → **Apple app configuration** → upload the `.p8` key, its Key ID and your Apple Team ID.
4. Run an iOS build: `pnpm mobile:build:ios -- --profile preview`. EAS enables the Push Notifications capability on the App ID when it creates the provisioning profile.

No TypeScript changes: the website bridge (`components/providers/NativePushBridge.tsx`, `lib/native-push.ts`) and the server sender already treat iOS the same as Android.

## 4. What to test once Android is live

1. In Settings, tap "Turn on notifications" — the OS permission prompt should appear (Android 13+; earlier versions have no runtime permission).
2. In `/admin/notifications`, use "Send test to me" — a system-tray notification should appear on the device within a few seconds.
3. Tap the notification — the app should open (or come to the foreground) and navigate to the notification's target page.
4. If nothing arrives: check Vercel's function logs for `[fcm]`-prefixed errors first (`fcm-server.ts` logs failures instead of throwing), then confirm `apps/mobile/google-services.json` is committed and `FCM_SERVICE_ACCOUNT_JSON` is actually set in the Production environment (not just Preview).
