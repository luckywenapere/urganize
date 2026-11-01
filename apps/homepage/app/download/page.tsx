import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResponsiveProductShot } from "../components/landing/ResponsiveProductShot";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CORE_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { hasLaunched } from "@/lib/launch-gate";
import type { ProductShot } from "@/content/product-shots";

// Handed directly to testers during the private Android launch, not discovered —
// noindex, not in the sitemap, not linked from ProductMenu, the footer, or
// anywhere else on the site. Same posture as /interview.
export const metadata: Metadata = {
  ...buildPageMetadata({
    // No "— Urganize" suffix here: the root layout's title template already
    // appends "| Urganize", and adding our own would render it twice.
    title: "Android app",
    description: `${CORE_LINE} Install the Android app.`,
    path: "/download",
  }),
  robots: { index: false, follow: false },
};

// Launch is 8 August 2026, midnight West Africa Time (founder's call, made
// 2026-08-07). Everything ships and deploys the day before, but the page 404s
// until that instant and then serves itself — deliberately NOT an env flag,
// because a flag needs a person awake at midnight to flip it in Vercel and
// redeploy. See lib/launch-gate.ts for how the timing holds.
//
// Note the APK at /downloads/urganize.apk IS reachable before this moment —
// static files can't be time-gated without middleware, which this app
// deliberately doesn't have. Nobody has that URL until this page ships it.
//
// Once launched, this gate is inert. Delete it whenever this file is next
// touched; leaving it does no harm.
const LAUNCH_AT = Date.parse("2026-08-07T23:00:00Z");

export const dynamic = "force-dynamic";

// Bump both when a new APK is dropped into public/downloads/urganize.apk —
// they ship in the same commit, so they can't drift. The filename stays
// versionless on purpose: links people have already shared keep working.
const APP_VERSION = "1.54.0";
const APK_SIZE = "41 MB";

const bodyText = "text-[var(--marketing-text-muted)]";

// The phone still (#968). A drawing, not a capture: Ada, the task and Lagoon
// Theory are made up, and the push wording is ours, not the app's real push.
// Drawn in the app's light and dark tokens on the site's own ground, so it
// follows the theme toggle. Sizes are the WebP files' pixel sizes (the stage
// at 2x); update them if the still is re-filmed.
const androidHome: ProductShot = {
  light: "/images/product/android-home.webp",
  dark: "/images/product/android-home-dark.webp",
  width: 1088,
  height: 920,
};
const androidHomePhone: ProductShot = {
  light: "/images/product/android-home-phone.webp",
  dark: "/images/product/android-home-phone-dark.webp",
  width: 716,
  height: 800,
};

export default async function DownloadPage() {
  if (!(await hasLaunched(LAUNCH_AT))) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-[34rem]">
          <p className="mono-label text-[var(--marketing-text-subtle)]">Android · Private beta</p>
          <h1 className="mt-6 text-[2.25rem] leading-[1.08] sm:text-[3rem]">
            Urganize for Android
          </h1>

          {/* The phone still (#968, mock approved by the founder
              2026-11-01): Home with a push for a task due today. Phone
              picture below sm, the wide one from sm up. */}
          <div className="mx-auto mt-10 max-w-[24rem] sm:max-w-none">
            <ResponsiveProductShot
              desktop={androidHome}
              phone={androidHomePhone}
              alt="An Android phone on Urganize's Home. A push at the top says Due today: Approve the cover art. Under it, the Next card shows the same task for Owambe Weather by Lagoon Theory."
              sizes="(min-width: 640px) 544px, calc(100vw - 48px)"
            />
          </div>

          <a
            href="/downloads/urganize.apk"
            download
            className="mt-10 flex items-center justify-between gap-4 rounded-full bg-[var(--marketing-primary)] px-7 py-4 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] transition-opacity hover:opacity-90 sm:text-base"
          >
            <span>Download for Android</span>
            <span className="whitespace-nowrap opacity-70">{APK_SIZE} ↓</span>
          </a>

          <p className={`mt-6 text-sm leading-6 ${bodyText}`}>
            Android will warn you that this didn&apos;t come from the Play Store. That&apos;s
            expected. Tap through it. Then sign in with your Urganize account.
          </p>

          <p className="mt-10 text-sm text-[var(--marketing-text-subtle)]">
            Version {APP_VERSION} ·{" "}
            <a
              href="mailto:contact@urganize.app?subject=Urganize%20for%20Android"
              className="text-[var(--marketing-accent)] hover:opacity-80"
            >
              Get help
            </a>
          </p>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
