import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

const APP_AUTH_URL = "https://app.urganize.app/auth";

// One header for every marketing page. The product is live and sells a
// 28-day no-card trial, so the primary CTA goes straight to app signup —
// no waitlist gate anywhere on the funnel.
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
            <Link
              href="/features"
              className="hidden text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)] sm:inline"
            >
              Features
            </Link>
            <Link
              href="/pricing"
              className="hidden text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)] sm:inline"
            >
              Pricing
            </Link>
            <Link
              href={APP_AUTH_URL}
              className="text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)]"
            >
              Login
            </Link>
            <ThemeToggle />
            <Link
              href={APP_AUTH_URL}
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--marketing-border-strong)] px-4 py-2.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text)] hover:border-[color:var(--marketing-text)] hover:bg-[var(--marketing-surface)] sm:px-5"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      <div className="h-[76px] sm:h-[84px]" />
    </>
  );
}
