import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { APP_LOGIN_URL, APP_SIGNUP_URL } from "@/lib/app-urls";

// Lives on the marketing domain for the same reason /login does — see the
// note there. Note the CTA points at /onboarding, not /auth: apps/web's
// /auth is login-only and has no signup form.
//
// This page also reverses the waitlist-only funnel (URG-125 + URG-136,
// 2026-07-15), which had removed every signup CTA from the marketing site in
// favour of the inline waitlist capture. Founder call, 2026-08-09: signup is
// a direct path again. The waitlist forms stay where they are — this is an
// additional door, not a replacement.

export const metadata: Metadata = buildPageMetadata({
  title: "Sign up",
  description:
    "Create your Urganize account and set up a workspace for your releases, tasks, and team.",
  path: "/signup",
});

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            Sign up
          </p>
          <h1 className="mt-6 text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] sm:text-[3.6rem]">
            Create your account
          </h1>
          <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
            Set up a workspace, add your first release, and get a rollout plan
            built from a real release template — not a blank board you have to
            fill in yourself.
          </p>

          <div className="mt-10">
            <a
              href={APP_SIGNUP_URL}
              className="relative z-[60] inline-flex touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] sm:text-base"
            >
              Create your account
            </a>
            <p className="mt-4 text-sm text-[var(--marketing-text-subtle)]">
              14 days free for your whole team. No card required.
            </p>
          </div>

          <section className="mt-16 border-t border-[color:var(--marketing-border)] py-10 sm:py-12">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">
              Who Urganize is for
            </h2>
            <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
              Artist managers and small labels running more than one
              artist&apos;s releases at once. If you&apos;re coordinating
              handoffs, files, and status across a roster, that&apos;s the
              problem this was built for. See{" "}
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
            <h2 className="text-xl font-semibold tracking-[-0.02em]">
              Joining a team?
            </h2>
            <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
              If a manager invited you, open the invite link they sent rather
              than signing up here — it joins you to their workspace instead of
              creating a separate one. Already have an account?{" "}
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
