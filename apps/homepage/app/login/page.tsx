import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CORE_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { APP_LOGIN_URL, APP_PASSWORD_RESET_URL } from "@/lib/app-urls";
import { PageDawn } from "../components/marketing/PageDawn";

// Why this page exists on the MARKETING domain rather than being a bare
// redirect to app.urganize.app (founder call, 2026-08-09): people search the
// brand to log in, and Google draws the sitelinks under the urganize.app
// result only from pages ON urganize.app. A subdomain is a separate site for
// that purpose, and a pure redirect isn't indexable either — so a real page
// here is the only way "Log in" can surface in that block. That also makes it
// a doorway-page risk if it's thin: keep real, useful copy on it.

export const metadata: Metadata = buildPageMetadata({
  title: "Log in",
  description:
    `${CORE_LINE} Log in to pick up your rollouts, activities and team.`,
  path: "/login",
});

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <div className="mx-auto max-w-3xl">
          <PageDawn>
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Log in
            </p>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] sm:text-[3rem]">
              Log in to Urganize
            </h1>
            <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
              Urganize is at app.urganize.app. Sign in there to pick up your
              rollouts, your activity list and whatever your team moved since
              you last looked.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a
                href={APP_LOGIN_URL}
                className="relative z-[60] inline-flex touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] sm:text-base"
              >
                Continue to log in
              </a>
              <a
                href={APP_PASSWORD_RESET_URL}
                className="text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] underline underline-offset-4 hover:text-[var(--marketing-text)]"
              >
                Forgot your password?
              </a>
            </div>
          </PageDawn>

          <section className="mt-16 border-t border-[color:var(--marketing-border)] py-10 sm:py-12">
            <h2 className="text-xl">
              Signing in with Google
            </h2>
            <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
              If you created your account with Google, use the same Google
              button on the sign-in screen. Email and Google sign-in reach the
              same account as long as the address matches.
            </p>
          </section>

          <section className="border-t border-[color:var(--marketing-border)] py-10 sm:py-12">
            <h2 className="text-xl">
              Don&apos;t have an account yet?
            </h2>
            <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
              You can{" "}
              <Link
                href="/signup"
                className="underline underline-offset-4 hover:text-[var(--marketing-text)]"
              >
                create one here
              </Link>
              . If a teammate invited you, open the invite link they sent
              instead. It joins you to their team rather than starting a new
              one.
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
