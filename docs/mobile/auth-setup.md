# Mobile auth setup: manual steps

Google blocks its sign-in screen inside embedded webviews, so the app cannot show it in its own webview. The app runs it in a system auth session instead: `ASWebAuthenticationSession` on iOS, a Chrome Custom Tab on Android, via `expo-web-browser`'s `openAuthSessionAsync`. Supabase then sends the person back to the app through the custom URL scheme `com.urganize.app://auth/callback`.

**The flow, end to end:**
1. `apps/web/lib/auth-store.ts` (`loginWithGoogle`) asks Supabase for the Google authorize URL with `redirectTo: com.urganize.app://auth/callback?next=…` and `skipBrowserRedirect`.
2. It sends that URL to the shell as an `oauth` request (`apps/web/lib/native-bridge.ts`).
3. The shell (`apps/mobile/App.tsx`) opens the auth session and returns the redirect URL when Supabase lands on the scheme.
4. The page rewrites the redirect to `/auth/callback…` and navigates there. The existing callback page exchanges the code; the PKCE verifier it needs is in the webview's own storage.

If the person closes the sheet, the request answers `cancelled` and the button stops spinning.

## 1. Supabase Dashboard → Authentication → URL Configuration

Under **Redirect URLs**, keep these entries, which were already added for the Capacitor app:

```
com.urganize.app://auth/callback
com.urganize.app://auth/callback?next=*
```

A single `com.urganize.app://**` also works. Do not remove `https://app.urganize.app/auth/callback`, which the website needs.

**If Google sign-in in the app finishes inside the browser sheet instead of returning to the app, this allowlist entry is the first thing to check.** When the redirect is not allowed, Supabase quietly falls back to the Site URL.

## 2. Google Cloud Console

No change. The app goes through Supabase's OAuth proxy exactly like the website does.

## 3. The scheme must match in three places

| Location | Value |
|---|---|
| `apps/mobile/app.config.ts` (`scheme`) | `com.urganize.app` |
| `apps/web/lib/auth-store.ts` (`NATIVE_OAUTH_SCHEME`) | `com.urganize.app://` |
| Supabase redirect allowlist | `com.urganize.app://auth/callback` |

Change all three together if the app id ever changes.

## 4. What to test

1. Tap "Continue with Google" in the app. A browser sheet opens on Google's real consent screen, not a "this browser is not supported" error.
2. Approve. The sheet closes and the app lands signed in on the page `next` pointed to.
3. Try again and close the sheet without approving. The app stays on the sign-in page and the button is usable again.
