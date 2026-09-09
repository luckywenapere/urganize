import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CUSTOMER_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { hasLaunched } from "@/lib/launch-gate";

// Handed directly to testers during the private Android launch, not discovered —
// noindex, not in the sitemap, not linked from ProductMenu, the footer, or
// anywhere else on the site. Same posture as /interview.
export const metadata: Metadata = {
  ...buildPageMetadata({
    // No "— Urganize" suffix here: the root layout's title template already
    // appends "| Urganize", and adding our own would render it twice.
    title: "Android app",
    description: `Install the Urganize Android app, the ${CUSTOMER_LINE}.`,
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
const APP_VERSION = "0.41.2";
const APK_SIZE = "3.2 MB";

const bodyText = "text-[var(--marketing-text-muted)]";

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
          <h1 className="mt-6 text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] sm:text-[3.6rem]">
            Urganize for Android
          </h1>

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
            expected — tap through it. Then sign in with your Urganize account.
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
