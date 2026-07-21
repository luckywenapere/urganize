# Codemagic iOS CI setup — manual steps

The workflow definition lives in `codemagic.yaml` at the repo root (`ios-capacitor`) and needs zero code changes to run — but Codemagic itself, and your Apple Developer account, need one-time setup in their dashboards. None of this can be scripted from here; it needs your own Apple/Codemagic login. Values only you can supply are marked **[FILL IN]**.

Why this exists at all: iOS builds require Xcode, which only runs on macOS — not available on your Windows PC. Codemagic provides that macOS build machine as a cloud CI service. Android has no equivalent problem (see the earlier steps you were given for `pnpm mobile:android` via Android Studio, which works fine on Windows).

## 1. Connect the repo to Codemagic

1. Go to **[FILL IN: https://codemagic.io](https://codemagic.io)** and sign up / log in with the GitHub account that owns `luckywenapere/urganize`.
2. Add application → select the `urganize` repo.
3. Codemagic will detect the `codemagic.yaml` file in the repo root and offer to use it ("YAML configuration" / "Use existing config file") — pick that, rather than letting it generate its own default workflow. If it doesn't auto-detect, go to the app's **Settings → Configuration** and point it at `codemagic.yaml` explicitly.

## 2. Register the app with Apple (if not already done)

Skip this section entirely if `com.urganize.app` already exists as a registered App ID and an App Store Connect app record — check before redoing it.

1. **[FILL IN: https://developer.apple.com/account/resources/identifiers/list]** → register an App ID with bundle identifier `com.urganize.app`, if one doesn't already exist.
2. **[FILL IN: https://appstoreconnect.apple.com/apps]** → "+" → New App → bundle ID `com.urganize.app`, platform iOS, whatever app name/SKU you want. This is where you'll later manage TestFlight testers, screenshots, and the app's public listing — none of that is this file's job, only the build/upload pipeline is.
3. Note the app's numeric **Apple ID** shown on its App Store Connect page (App Information tab) — you'll need it for step 4 below. This is a different value from the bundle identifier.

## 3. Create the App Store Connect API key integration in Codemagic

This is what lets Codemagic sign the app and upload builds without you ever handling a `.p12` certificate or `.mobileprovision` file by hand.

1. **[FILL IN: https://appstoreconnect.apple.com/access/integrations/api]** (requires an Admin-role Apple Developer account) → generate a new API key with **App Manager** access (or higher).
2. Download the `.p8` private key file **once** — Apple only lets you download it a single time.
3. In Codemagic: **Team settings → Integrations → App Store Connect** → add the integration using the Issuer ID, Key ID, and the `.p8` file from step 1. Give the integration a name — whatever you pick, it must exactly match the `integrations.app_store_connect` value in `codemagic.yaml` (currently `urganize_asc` as a placeholder — change one or the other so they match).

## 4. Fill in the remaining `[FILL IN]` markers in `codemagic.yaml`

- `integrations.app_store_connect`: the integration name from step 3.
- `environment.vars.APP_STORE_APPLE_ID`: the numeric Apple ID from step 2.3.
- `publishing.email.recipients`: your email, for build success/failure notifications.

Commit and push that change like any other — no separate Codemagic-side config needed once these three values are correct.

## 5. Trigger the first build

The workflow is configured to trigger on pushing a git tag matching `ios-v*` (e.g. `git tag ios-v0.1.0 && git push origin ios-v0.1.0`). For your very first test, it's easier to skip tagging and just trigger it manually instead: in the Codemagic dashboard, open the app → **Start new build** → select the `ios-capacitor` workflow and the `main` branch → Start.

Watch the build log. The first run will be the slowest (cold CocoaPods/Xcode caches); expect several minutes.

## 6. What happens on success

The workflow builds a signed `.ipa` and uploads it straight to **TestFlight** (`submit_to_testflight: true`, `submit_to_app_store: false` in `codemagic.yaml`) — it does not go to the public App Store until you deliberately flip that flag later. To actually install it on your phone:

1. In App Store Connect, add yourself as an internal tester on the app (or add your Apple ID email under TestFlight → Internal Testing).
2. Install the **TestFlight** app from the App Store on your iPhone, sign in, and the build should appear once Apple finishes its (usually fast, automatic) TestFlight processing step.

## Out of scope for this file

Apple's actual App Store review (screenshots, description, privacy policy URL, age rating, privacy "nutrition label" answers, export compliance) is App Store Connect metadata work you do directly in their dashboard — this CI pipeline only builds and uploads the binary, it doesn't fill in listing content for you.
