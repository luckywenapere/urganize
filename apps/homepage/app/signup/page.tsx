import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CORE_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { APP_LOGIN_URL, WAITLIST_URL } from "@/lib/app-urls";
import { PageDawn } from "../components/marketing/PageDawn";
import { ResponsiveProductShot } from "../components/landing/ResponsiveProductShot";
import type { ProductShot } from "@/content/product-shots";

// Lives on the marketing domain so it can be found by people searching the
// brand (founder call, 2026-08-09; see the note in app/sitemap.ts). The URL
// stays /signup so old links keep working, but the page
// is the waitlist: its one button goes to WAITLIST_URL, and its copy says
// waitlist, never sign up (house copy rule). It was a direct sign-up door to
// /onboarding from 2026-08-09 until the waitlist came back.

export const metadata: Metadata = buildPageMetadata({
  title: "Waitlist",
  description:
    `${CORE_LINE} Join the waitlist and we will let you in as spots open.`,
  path: "/signup",
});

// The first-release still (#965, mock approved by the founder 2026-11-01):
// what a team gets once let in, its first release with the plan already
// filled in. A drawn picture, not a capture, in the app's light and dark
// tokens so it follows the site's theme toggle. Fictional artist (Ada Sol);
// the three tasks are the single playbook's first ones, word for word, and
// "64 activities, 11 weeks" is that playbook's real size. If the playbook or
// the release page changes, redraw all four. The drawing is a Stageshow
// scene (examples/urg-first-release, kept outside the repo); with no copy of
// it to hand, redraw from the approved mock linked on #965.
const firstRelease: ProductShot = {
  light: "/images/product/first-release.webp",
  dark: "/images/product/first-release-dark.webp",
  width: 1280,
  height: 880,
};
const firstReleasePhone: ProductShot = {
  light: "/images/product/first-release-phone.webp",
  dark: "/images/product/first-release-phone-dark.webp",
  width: 716,
  height: 760,
};

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <div className="mx-auto max-w-6xl">
          {/* Two columns from lg: the copy and its button on the left, the
              still on the right. Below lg the still sits under the button,
              so the button stays above the fold on a phone. */}
          <PageDawn className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <p className="mono-label text-[var(--marketing-text-subtle)]">
                Waitlist
              </p>
              <h1 className="mt-6 text-[2.25rem] leading-[1.08] sm:text-[3rem]">
                Join the waitlist
              </h1>
              <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
                Tell Urganize your goals and get a plan that fits. Or make
                your own.
              </p>

              <div className="mt-10">
                <a
                  href={WAITLIST_URL}
                  className="relative z-[60] inline-flex touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] sm:text-base"
                >
                  Join waitlist
                </a>
                <p className="mt-4 text-sm text-[var(--marketing-text-subtle)]">
                  We are letting people in from the waitlist.
                </p>
              </div>
            </div>

            <div className="w-full max-w-[22.375rem] sm:max-w-[40rem] lg:justify-self-end">
              <ResponsiveProductShot
                desktop={firstRelease}
                phone={firstReleasePhone}
                alt="A release called Sunday Light by Ada Sol in Urganize, with this week's three activities already planned and a card saying your plan is ready: 64 activities over 11 weeks."
                sizes="(min-width: 1024px) min(46vw, 608px), (min-width: 688px) 640px, calc(100vw - 48px)"
              />
            </div>
          </PageDawn>

          <section className="mt-16 border-t border-[color:var(--marketing-border)] py-10 sm:py-12">
            <h2 className="text-xl">
              Who Urganize is for
            </h2>
            <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
              Artists, managers and record labels. Use it on your own or with
              a team to plan new music and keep track of every task. See{" "}
              <Link
                href="/features"
                className="underline underline-offset-4 hover:text-[var(--marketing-text)]"
              >
                what&apos;s in it
              </Link>{" "}
              or{" "}
              <Link
                href="/pricing"
                className="underline underline-offset-4 hover:text-[var(--marketing-text)]"
              >
                what it costs
              </Link>
              .
            </p>
          </section>

          <section className="border-t border-[color:var(--marketing-border)] py-10 sm:py-12">
            <h2 className="text-xl">
              Joining a team?
            </h2>
            <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
              If a manager invited you, open the invite link they sent rather
              than joining the waitlist here. It takes you straight into their
              team. Already have an account?{" "}
              <a
                href={APP_LOGIN_URL}
                className="underline underline-offset-4 hover:text-[var(--marketing-text)]"
              >
                Log in
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
