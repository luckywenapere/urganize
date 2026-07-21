# Mobile auth setup — manual steps

These are one-time, project-specific configuration changes you make in the **Supabase Dashboard** and **Google Cloud Console** for the two native apps (iOS + Android) to be able to complete a Google sign-in. None of this is code — it's dashboard config the audit and the code changes can't fill in for you. Values you need to look up or decide are marked **[FILL IN]**.

Background: the code change (`apps/web/lib/auth-store.ts`, `apps/web/components/providers/CapacitorAuthBridge.tsx`) makes the native apps open Google's OAuth consent screen in the **system browser** (via `@capacitor/browser`) instead of the app's own webview — Google blocks its OAuth flow inside embedded webviews, so this isn't optional. The system browser then redirects back into the app via the custom URL scheme `com.urganize.app://auth/callback`, which is already registered in both native projects (`apps/mobile/ios/App/App/Info.plist`, `apps/mobile/android/app/src/main/AndroidManifest.xml`).

## 1. Supabase Dashboard → Authentication → URL Configuration

Go to your project at **[FILL IN: https://supabase.com/dashboard/project/`<your-project-ref>`/auth/url-configuration]**.

Under **Redirect URLs**, add (in addition to whatever is already there for the web app):

```
com.urganize.app://auth/callback
com.urganize.app://auth/callback?next=*
```

Supabase's redirect allowlist supports wildcards, so a single entry `com.urganize.app://**` also works if you'd rather not enumerate every `next=` variant. Do **not** remove the existing `https://app.urganize.app/auth/callback` entry — the web app still needs it.

## 2. Google Cloud Console → OAuth client

This part likely needs **no change** if your existing Google OAuth client is already configured the way Supabase's Google provider setup guide describes (Authorized redirect URI pointing at your Supabase project's `/auth/v1/callback` endpoint) — the mobile app doesn't talk to Google directly, it goes through Supabase's OAuth proxy exactly like the web app does. Skip this step unless Supabase's dashboard flags a redirect URI mismatch error during testing.

If you do need to check it: **[FILL IN: https://console.cloud.google.com/apis/credentials?project=`<your-gcp-project>`]** → your OAuth 2.0 Client ID → confirm **Authorized redirect URIs** includes:

```
https://[FILL IN: your-project-ref].supabase.co/auth/v1/callback
```

## 3. Confirm the custom URL scheme matches everywhere

The scheme `com.urganize.app` (the app's own bundle ID / applicationId, used as a URL scheme — a common, simple pattern that avoids needing Universal Links / App Links associated-domain hosting) must be **identical** in four places. All four already match as of this setup — this is here so a future rename doesn't silently break one of them:

| Location | Value |
|---|---|
| `apps/mobile/capacitor.config.ts` (`appId`) | `com.urganize.app` |
| `apps/mobile/ios/App/App/Info.plist` (`CFBundleURLSchemes`) | `com.urganize.app` |
| `apps/mobile/android/app/src/main/AndroidManifest.xml` (intent-filter `android:scheme`) | `com.urganize.app` |
| `apps/web/lib/auth-store.ts` (`NATIVE_OAUTH_SCHEME`) and `apps/web/components/providers/CapacitorAuthBridge.tsx` (`NATIVE_OAUTH_SCHEME`) | `com.urganize.app://` |

If you ever change the app's bundle ID / applicationId, update all four together.

## 4. What to actually test once you have the app running (see the numbered device steps you were given separately)

1. Tap "Continue with Google" in the app.
2. The system browser (Chrome Custom Tabs on Android, SFSafariViewController on iOS) should open showing Google's real consent screen — **not** a blank page or an "this browser is not supported" error from Google. If you see the latter, the OAuth call is still running inside the webview somewhere — check `isNativePlatform()` is returning `true` (see `apps/web/lib/platform.ts`).
3. After approving, the system browser should close itself and control should return to the app, landing you signed in on `/dashboard` (or wherever `next` pointed). If instead the system browser just sits on a blank `com.urganize.app://auth/callback...` page and never returns to the app, the redirect URL isn't in Supabase's allowlist yet (step 1 above) or the native intent-filter/URL scheme registration didn't take (step 3 above) — check with `adb logcat` (Android) or Xcode's device console (iOS) for a "no app found to handle this URL" style error.
