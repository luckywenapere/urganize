import Image from "next/image";
import Link from "next/link";
import { ProductMenu } from "./ProductMenu";
import { ThemeToggle } from "./ThemeToggle";

// One header for every marketing page. Product pages (Features, Pricing, Why
// Urganize, Privacy) live in the ProductMenu dropdown — their ONLY home;
// they're deliberately not in the footer (URG-161).
//
// Funnel note (founder call, 2026-08-09): the waitlist-only funnel
// (URG-125 + URG-136) no longer holds — signup is a direct path again, via
// /signup in the ProductMenu. The inline waitlist capture stays in the page
// body; signup is an additional door, not a replacement for it.
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
        <div className="mx-auto flex max-w-[84rem] items-center justify-between gap-6 px-6 py-4 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="flex h-11 shrink-0 items-center overflow-hidden sm:h-12"
            aria-label="Urganize home"
          >
            <Image
              src="/images/urganize-logo.svg"
              alt="Urganize"
              width={680}
              height={144}
              className="marketing-wordmark mt-[-0.55rem] h-20 w-auto max-w-none sm:mt-[-0.7rem] sm:h-24"
              priority
            />
          </Link>

          <div className="flex items-center gap-4 sm:gap-6">
            <ProductMenu />
            <Link
              href="/login"
              className="text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)]"
            >
              Log in
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="h-[76px] sm:h-[84px]" />
    </>
  );
}
