import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLaunched } from "@/lib/launch-gate";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";

// Handed directly to testers during the private Android launch, not discovered —
// noindex, not in the sitemap, not linked from ProductMenu, the footer, or
// anywhere else on the site. Same posture as /interview.
export const metadata: Metadata = {
  ...buildPageMetadata({
    // No "— Urganize" suffix here: the root layout's title template already
    // appends "| Urganize", and adding our own would render it twice.
    title: "Urganize for Android",
    description: "Install the Urganize Android app.",
    path: "/download",
  }),
  robots: { index: false, follow: false },
};

// Launch is 8 August 2026, midnight West Africa Time (founder's call, made
// 2026-08-07). Everything ships and deploys the day before, but the page 404s
// until that instant and then serves itself — deliberately NOT an env flag,
// because a flag needs a person awake at midnight to flip it in Vercel and
// redeploy. Rendering per-request is what makes the clock reachable at all;
// the page is tiny and unlisted, so that costs nothing.
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

const sectionEyebrow = "mono-label text-[var(--marketing-text-subtle)]";
const bodyText = "text-[var(--marketing-text-muted)]";
const downloadRow =
  "flex items-center justify-between gap-4 bg-[var(--marketing-bg)] px-4 py-3.5 text-sm transition-colors hover:bg-[var(--marketing-surface)]";

const INSTALL_STEPS = [
  "Tap the download above. Your browser will ask you to confirm — that's expected for a file rather than a page.",
  "Open the downloaded file. Android will ask whether to allow installs from this app; allow it, then come back and open the file again.",
  "You'll see a Play Protect warning. Tap \"Install anyway\" — it appears for every app that isn't on the Play Store yet, including this one.",
  "Open Urganize and sign in the way you normally do on the web.",
] as const;

export default async function DownloadPage() {
  if (!(await hasLaunched(LAUNCH_AT))) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <p className={sectionEyebrow}>Android · Private beta</p>
          <h1 className="mt-6 text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] sm:text-[3.6rem]">
            Urganize for Android
          </h1>
          <p className={`mt-4 max-w-[38rem] ${bodyText}`}>
            The same workspace you use on the web, on your phone. It isn&apos;t on the Play
            Store yet, so you install it directly from here.
          </p>

          <section className="mt-12">
            <div className="space-y-px bg-[color:var(--marketing-border)]">
              <a href="/downloads/urganize.apk" download className={downloadRow}>
                <span className="font-medium text-[var(--marketing-text)]">
                  Download APK
                </span>
                <span className="mono-label whitespace-nowrap text-[var(--marketing-text-subtle)]">
                  {APK_SIZE} ↓
                </span>
              </a>
            </div>
            <p className={`mt-3 text-sm ${bodyText}`}>
              Version {APP_VERSION}. You&apos;ll need an Urganize account to sign in — if you
              don&apos;t have one yet, installing the app won&apos;t create it for you.
            </p>
          </section>

          <section className="mt-16">
            <p className={sectionEyebrow}>Installing</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              Four steps
            </h2>
            <ol className="mt-6 space-y-4">
              {INSTALL_STEPS.map((step, index) => (
                <li key={step} className="flex gap-4">
                  <span className="mono-label shrink-0 pt-0.5 text-[var(--marketing-text-subtle)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={`text-sm leading-6 ${bodyText}`}>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-16">
            <p className={sectionEyebrow}>Updates</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              You won&apos;t need this page often
            </h2>
            <p className={`mt-4 max-w-[38rem] text-sm leading-6 ${bodyText}`}>
              The app loads Urganize itself, so day-to-day improvements reach you the moment
              they ship — no reinstalling. Come back here only when we tell you the app
              itself has changed, and install over the top; you&apos;ll stay signed in.
            </p>
          </section>

          <section className="mt-16">
            <p className={sectionEyebrow}>Trouble</p>
            <p className={`mt-3 text-sm ${bodyText}`}>
              Something not working?{" "}
              <a
                href="mailto:contact@urganize.app?subject=Urganize%20for%20Android"
                className="text-[var(--marketing-accent)] hover:opacity-80"
              >
                contact@urganize.app
              </a>
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
