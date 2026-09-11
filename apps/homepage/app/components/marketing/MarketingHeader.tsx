import Image from "next/image";
import Link from "next/link";
import { ProductMenu } from "./ProductMenu";
import { ThemeToggle } from "./ThemeToggle";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

// One header for every marketing page. Product pages (Features, Pricing, Why
// Urganize, Privacy) live in the ProductMenu dropdown — their ONLY home;
// they're deliberately not in the footer (URG-161).
//
// Funnel note (founder calls, 2026-08-09 then 2026-08-30): the waitlist-only
// funnel (URG-125 + URG-136) no longer holds. Signup became a direct path again
// via /signup in the ProductMenu, and the header's primary button now starts a
// free trial outright, because the two lowest pricing tiers are self-serve. The
// inline waitlist capture stays in the page bodies for anyone not ready to
// start; it is a second door now, not the only one.
//
// Login points at /login on THIS domain rather than jumping straight to
// app.urganize.app. That costs a returning user one click, bought
// deliberately: sitelinks under the urganize.app result can only be
// urganize.app pages, so "Log in" can't appear there without a real page
// here. Keeping this link and the ProductMenu's on the same destination also
// avoids two "Log in" links in one header going to different places.
export function MarketingHeader() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[color:var(--marketing-border)] bg-[var(--marketing-bg)]/85 backdrop-blur-md">
        {/* THE GAPS TIGHTEN BELOW sm, AND THAT IS THE LONGER CTA PAYING FOR
            ITSELF. "Try Urganize" replaced "Start free" on 2026-09-11 and costs
            about 20px more. Measured at 375px, where the row is logo (56.9px:
            13px tall on a 7726x1766 wordmark) + "Product" + the CTA + the theme
            toggle, with "Log in" already stepped aside (hidden sm:block), and
            only 327px available once px-6 is taken off both sides: the old
            label left roughly 15px spare, so the new one would have overflowed.
            Dropping the outer gap 24 -> 12 and the inner 16 -> 12 gives back
            the same 20px.

            Nothing above sm changes, and nothing wide changes either: with
            justify-between a gap is only a floor, so it binds at exactly the
            tight widths and nowhere else. If a control is ever added to this
            row, re-measure rather than assuming this still fits. */}
        <div className="mx-auto flex max-w-[84rem] items-center justify-between gap-3 px-6 py-4 sm:gap-6 sm:px-8 lg:px-10">
          {/* The wordmark's viewBox is cropped to the ink (see the comment in
              the SVG), so items-center alone lands it on the same centreline as
              Product, Log in, the CTA and the toggle. It used to be cropped
              here instead, with overflow-hidden and a negative margin, which
              left it a few pixels high. The h-11/h-12 on the link is what sets
              the header's row height, so it stays: dropping it would shrink the
              bar out from under the fixed spacer below.

              The heights are the pre-crop rendered size to the pixel, so the
              logo looks exactly as it did — this change moved it, it did not
              resize it. */}
          <Link
            href="/"
            className="flex h-11 shrink-0 items-center sm:h-12"
            aria-label="Urganize home"
          >
            <Image
              src="/images/urganize-logo.svg"
              alt="Urganize"
              width={7726}
              height={1766}
              className="marketing-wordmark h-[13px] w-auto sm:h-[15px]"
              priority
            />
          </Link>

          <div className="flex items-center gap-3 sm:gap-6">
            <ProductMenu />
            <Link
              href="/login"
              className="hidden text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)] sm:block"
            >
              Log in
            </Link>
            {/* The header's one primary CTA (added 2026-08-13). It pointed at
                the homepage waitlist form until 2026-08-30, when the two lowest
                tiers went self-serve: a visitor who can sign up and start a free
                trial today should not be asked to join a queue instead. The
                waitlist forms stay in the page bodies for anyone not ready.
                Below sm, "Log in" steps aside for it; returning users still have
                Log in via the ProductMenu.

                A plain <a>, not next/link: this leaves the marketing domain for
                the product app. APP_SIGNUP_URL is /onboarding, NOT /auth, which
                is login-only — see lib/app-urls.ts. */}
            <a
              href={APP_SIGNUP_URL}
              data-track="start_trial_click"
              data-location="header"
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--marketing-primary)] px-4 py-2 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] hover:bg-[var(--marketing-primary-hover)] sm:px-5 sm:py-2.5"
            >
              Try Urganize
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="h-[76px] sm:h-[84px]" />
    </>
  );
}
