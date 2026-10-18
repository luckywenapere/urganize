import Image from "next/image";
import { ONE_LINER } from "@/lib/positioning";
import Link from "next/link";
import { BackToTopButton } from "./BackToTopButton";
import { FaLinkedin } from "react-icons/fa6";
import {
  SiInstagram,
  SiThreads,
  SiTiktok,
  SiX,
  SiYoutube,
} from "react-icons/si";

const socialLinks = [
  { href: "https://x.com/urganize", label: "Urganize on X", Icon: SiX },
  {
    href: "https://www.linkedin.com/company/urganize",
    label: "Urganize on LinkedIn",
    Icon: FaLinkedin,
  },
  {
    href: "https://www.instagram.com/urganize",
    label: "Urganize on Instagram",
    Icon: SiInstagram,
  },
  {
    href: "https://www.tiktok.com/@urganize",
    label: "Urganize on TikTok",
    Icon: SiTiktok,
  },
  {
    href: "https://www.youtube.com/@urganize",
    label: "Urganize on YouTube",
    Icon: SiYoutube,
  },
  {
    href: "https://www.threads.net/@urganize",
    label: "Urganize on Threads",
    Icon: SiThreads,
  },
] as const;

// Flag-gated (matches app/roadmap/page.tsx's own 404-when-off guard): the
// footer link only appears once NEXT_PUBLIC_FEATURE_ROADMAP is on, so
// flipping that one env var in Vercel is the entire "go live" action.
const ROADMAP_ENABLED = process.env.NEXT_PUBLIC_FEATURE_ROADMAP === "true";

// Product pages (Features, Pricing, Why Urganize, Privacy) are deliberately
// absent — they live only in the header's ProductMenu dropdown (URG-161).
const footerLinks = [
  { href: "/guides", label: "Guides" },
  { href: "/team", label: "Team" },
  { href: "/community", label: "Community" },
  { href: "/brand", label: "Brand" },
  { href: "/changelog", label: "Updates" },
  ...(ROADMAP_ENABLED ? [{ href: "/roadmap", label: "Roadmap" }] : []),
  { href: "/terms", label: "Terms" },
] as const;

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
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            {/* Same crop fix as the header: the SVG's viewBox is the ink now,
                so this needs no overflow-hidden and no negative margin. h-12
                stays because it reserves this block's height in the footer
                grid; h-[15px] is the pre-crop rendered size to the pixel. */}
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
            {/* The footer tagline (2026-09-09). One line, the one-liner from
                lib/positioning, so the last thing on every marketing page
                says what this is. */}
            <p className="mt-1 max-w-[22rem] text-sm leading-6 text-[var(--marketing-text-subtle)]">
              {ONE_LINER}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm tracking-[-0.01em] text-[var(--marketing-text-subtle)]">
            {footerLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="hover:text-[var(--marketing-text)]"
              >
                {label}
              </Link>
            ))}
            <a
              href="mailto:contact@urganize.app"
              className="hover:text-[var(--marketing-text)]"
            >
              Contact
            </a>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-5">
          {socialLinks.map(({ href, label, Icon }) => (
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

        <p className="mt-6 text-center font-mono text-[0.68rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
          &copy; {currentYear} Urganization
        </p>
      </div>
    </footer>
  );
}
