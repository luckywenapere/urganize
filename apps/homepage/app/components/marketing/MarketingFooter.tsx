import Image from "next/image";
import Link from "next/link";
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

const footerLinks = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/team", label: "Team" },
  { href: "/press", label: "Press" },
  { href: "/privacy", label: "Privacy" },
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
      <div className="mx-auto max-w-[84rem] px-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href="/"
              className="flex h-12 items-center overflow-hidden"
              aria-label="Urganize home"
            >
              <Image
                src="/images/urganize-logo.svg"
                alt="Urganize"
                width={680}
                height={144}
                className="marketing-wordmark mt-[-0.6rem] h-24 w-auto max-w-none"
              />
            </Link>
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
          &copy; {currentYear} The Urganization Ltd
        </p>
      </div>
    </footer>
  );
}
