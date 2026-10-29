import Image from "next/image";
import { ONE_LINER } from "@/lib/positioning";
import Link from "next/link";
import { BackToTopButton } from "./BackToTopButton";
import { SOCIAL_LINKS } from "@/lib/socials";

// Flag-gated (matches app/roadmap/page.tsx's own 404-when-off guard): the
// footer link only appears once NEXT_PUBLIC_FEATURE_ROADMAP is on, so
// flipping that one env var in Vercel is the entire "go live" action.
const ROADMAP_ENABLED = process.env.NEXT_PUBLIC_FEATURE_ROADMAP === "true";

// Product pages (Features, Pricing, Why Urganize) live only in the header's
// ProductMenu dropdown (URG-161). The footer carries two short columns:
// the company pages, and the legal pages people look for at the bottom of a
// site (URG-413, 2026-10-19: Privacy and Subprocessors added after the terms
// update, so the policy is one click from every page). Community left the
// footer on 2026-10-29 (founder call: nobody used it); the WhatsApp group and
// the socials now sit in the header menu's Community section.
const footerColumns = [
  {
    heading: "Company",
    links: [
      { href: "/team", label: "Team" },
      { href: "/guides", label: "Guides" },
      { href: "/changelog", label: "Updates" },
      ...(ROADMAP_ENABLED ? [{ href: "/roadmap", label: "Roadmap" }] : []),
      { href: "/brand", label: "Brand" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/subprocessors", label: "Subprocessors" },
      { href: "mailto:contact@urganize.app", label: "Contact" },
    ],
  },
];

// One footer for every marketing page — same wordmark, same link set,
// same socials, so moving between pages never feels like changing sites.
export function MarketingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="pb-10 pt-14 sm:pb-12 sm:pt-16 lg:pb-14 lg:pt-20"
      style={{ borderTop: "0.5px solid var(--marketing-border)" }}
    >
      <BackToTopButton />
      <div className="mx-auto max-w-[84rem] px-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          <div>
            {/* Same crop fix as the header: the SVG's viewBox is the ink now,
                so this needs no overflow-hidden and no negative margin. */}
            <Link
              href="/"
              className="flex h-12 items-center"
              aria-label="Urganize home"
            >
              <Image
                src="/images/urganize-logo.svg"
                alt="Urganize"
                width={7726}
                height={1766}
                className="marketing-wordmark h-[15px] w-auto"
              />
            </Link>
            {/* The footer tagline: the one-liner from lib/positioning, so the
                last thing on every marketing page says what this is. */}
            <p className="mt-1 max-w-[22rem] text-sm leading-6 text-[var(--marketing-text-subtle)]">
              {ONE_LINER}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-5">
              {SOCIAL_LINKS.map(({ href, label, Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-[var(--marketing-text-subtle)] transition-colors hover:text-[var(--marketing-text)]"
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </a>
              ))}
            </div>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-16 gap-y-10 sm:gap-x-24 md:pt-3"
          >
            {footerColumns.map(({ heading, links }) => (
              <div key={heading}>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[var(--marketing-text-subtle)]">
                  {heading}
                </p>
                <ul className="mt-4 space-y-3 text-sm tracking-[-0.01em]">
                  {links.map(({ href, label }) => (
                    <li key={href}>
                      {href.startsWith("mailto:") ? (
                        <a
                          href={href}
                          className="text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)]"
                        >
                          {label}
                        </a>
                      ) : (
                        <Link
                          href={href}
                          className="text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)]"
                        >
                          {label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div
          className="mt-14 pt-6"
          style={{ borderTop: "0.5px solid var(--marketing-border)" }}
        >
          <p className="font-mono text-[0.68rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
            &copy; {currentYear} Urganization
          </p>
        </div>
      </div>
    </footer>
  );
}
